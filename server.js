const express = require("express");
const app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var kurento = require("kurento-client");
var minimist = require("minimist");

// Initialize global variables
var kurentoClient = null;
var iceCandidateQueues = {};

// Command line arguments, Kurento server URL
var argv = minimist(process.argv.slice(2), {
  default: {
    ws_uri: "ws://localhost:8888/kurento",
  },
});

// For static files
app.use(express.static("public"));

// Socket.io callbacks
io.on("connection", function (socket) {
  console.log("A user connected");

  socket.on("message", function (message) {
    console.log("Message received: ", message.event);

    switch (message.event) {
      case "joinRoom":
        // A new client wants to join a room
        joinRoom(socket, message.userName, message.roomName, (err) => {
          if (err) {
            console.log(err);
          }
        });
        break;

      case "receiveVideoFrom":
        // A client was notified of a new participant and wants to receive video from them
        // Or a new client wants to send video
        receiveVideoFrom(
          socket,
          message.userid,
          message.roomName,
          message.sdpOffer,
          (err) => {
            if (err) {
              console.log(err);
            }
          }
        );
        break;

      case "candidate":
        // A candidate was found by a client
        // Could be for either sender or receiver peer
        addIceCandidate(
          socket,
          message.userid,
          message.roomName,
          message.candidate,
          (err) => {
            if (err) {
              console.log(err);
            }
          }
        );
        break;
    }
  });
});

function joinRoom(socket, username, roomname, callback) {
  getRoom(socket, roomname, (err, myRoom) => {
    if (err) {
      return callback(err);
    }

    // Create a new WebRtcEndpoint for the rooms pipeline
    // outgoingMedia is a peer connection
    myRoom.pipeline.create("WebRtcEndpoint", (err, outgoingMedia) => {
      if (err) {
        return callback(err);
      }

      var user = {
        id: socket.id,
        name: username,
        outgoingMedia: outgoingMedia, // The peer connection which will receive video for this user
        incomingMedia: {}, // The peers which will send video streams to this user
      };

      // TODO: Not sure about this
      let iceCandidateQueue = iceCandidateQueues[user.id];
      if (iceCandidateQueue) {
        while (iceCandidateQueue.length) {
          let ice = iceCandidateQueue.shift();
          console.error(
            `user: ${user.name} collect candidate for outgoing media`
          );
          user.outgoingMedia.addIceCandidate(ice.candidate);
        }
      }

      // When a ICE candidate is found for this peer, we send it to the client.
      user.outgoingMedia.on("IceCandidateFound", (event) => {
        let candidate = kurento.register.complexTypes.IceCandidate(
          event.candidate
        );
        socket.emit("message", {
          event: "candidate",
          userid: user.id,
          candidate: candidate,
        });
      });

      // Tell all other clients in the room that a new participant arrived.
      socket.to(roomname).emit("message", {
        event: "newParticipantArrived",
        userid: user.id,
        username: user.name,
      });

      // Tell the newly joined client about all the existing clients
      let existingUsers = [];
      for (let i in myRoom.participants) {
        if (myRoom.participants[i].id != user.id) {
          existingUsers.push({
            id: myRoom.participants[i].id,
            name: myRoom.participants[i].name,
          });
        }
      }
      socket.emit("message", {
        event: "existingParticipants",
        existingUsers: existingUsers,
        userid: user.id,
      });

      // Add newly joined participant to the room
      myRoom.participants[user.id] = user;
    });
  });
}

function receiveVideoFrom(socket, userid, roomname, sdpOffer, callback) {
  // Get the user whose peer needs to get the sdp offer
  getEndpointForUser(socket, roomname, userid, (err, endpoint) => {
    if (err) {
      return callback(err);
    }

    // Give that peer the offer
    endpoint.processOffer(sdpOffer, (err, sdpAnswer) => {
      if (err) {
        return callback(err);
      }

      // Once the offer is processed and an answer is generated we send that answer back
      socket.emit("message", {
        event: "receiveVideoAnswer",
        senderid: userid,
        sdpAnswer: sdpAnswer,
      });

      // Start gathering candidates for that peer now
      endpoint.gatherCandidates((err) => {
        if (err) {
          return callback(err);
        }
      });
    });
  });
}

function addIceCandidate(socket, senderid, roomname, iceCandidate, callback) {
  let user = io.sockets.adapter.rooms[roomname].participants[socket.id];
  if (user != null) {
    let candidate = kurento.register.complexTypes.IceCandidate(iceCandidate);
    if (senderid == user.id) {
      if (user.outgoingMedia) {
        user.outgoingMedia.addIceCandidate(candidate);
      } else {
        iceCandidateQueues[user.id].push({ candidate: candidate });
      }
    } else {
      if (user.incomingMedia[senderid]) {
        user.incomingMedia[senderid].addIceCandidate(candidate);
      } else {
        if (!iceCandidateQueues[senderid]) {
          iceCandidateQueues[senderid] = [];
        }
        iceCandidateQueues[senderid].push({ candidate: candidate });
      }
    }
    callback(null);
  } else {
    callback(new Error("addIceCandidate failed"));
  }
}

// Called when a new user calls joinRoom.
// If a room of that name already exists, we add the new user's socket to that room
// If a room does not exist, we create a new Socket.io room and add the user to it
// Then we create a new Kurento MediaPipeline and set it as the new rooms pipeline
function getRoom(socket, roomname, callback) {
  var myRoom = io.sockets.adapter.rooms[roomname] || { length: 0 };
  var numClients = myRoom.length;

  console.log(roomname, " has ", numClients, " clients");

  if (numClients == 0) {
    socket.join(roomname, () => {
      myRoom = io.sockets.adapter.rooms[roomname];
      getKurentoClient((error, kurento) => {
        kurento.create("MediaPipeline", (err, pipeline) => {
          if (error) {
            return callback(err);
          }

          myRoom.pipeline = pipeline;
          myRoom.participants = {};
          callback(null, myRoom);
        });
      });
    });
  } else {
    socket.join(roomname);
    callback(null, myRoom);
  }
}

function getEndpointForUser(socket, roomname, senderid, callback) {
  var myRoom = io.sockets.adapter.rooms[roomname];
  var asker = myRoom.participants[socket.id];
  var sender = myRoom.participants[senderid];

  if (asker.id === sender.id) {
    return callback(null, asker.outgoingMedia);
  }

  if (asker.incomingMedia[sender.id]) {
    sender.outgoingMedia.connect(asker.incomingMedia[sender.id], (err) => {
      if (err) {
        return callback(err);
      }
      callback(null, asker.incomingMedia[sender.id]);
    });
  } else {
    myRoom.pipeline.create("WebRtcEndpoint", (err, incoming) => {
      if (err) {
        return callback(err);
      }

      asker.incomingMedia[sender.id] = incoming;

      let iceCandidateQueue = iceCandidateQueues[sender.id];
      if (iceCandidateQueue) {
        while (iceCandidateQueue.length) {
          let ice = iceCandidateQueue.shift();
          console.error(
            `user: ${sender.name} collect candidate for outgoing media`
          );
          incoming.addIceCandidate(ice.candidate);
        }
      }

      incoming.on("IceCandidateFound", (event) => {
        let candidate = kurento.register.complexTypes.IceCandidate(
          event.candidate
        );
        socket.emit("message", {
          event: "candidate",
          userid: sender.id,
          candidate: candidate,
        });
      });

      sender.outgoingMedia.connect(incoming, (err) => {
        if (err) {
          return callback(err);
        }
        callback(null, incoming);
      });
    });
  }
}

// Get a KurentoClient object
function getKurentoClient(callback) {
  if (kurentoClient !== null) {
    return callback(null, kurentoClient);
  }

  kurento(argv.ws_uri, function (error, _kurentoClient) {
    if (error) {
      console.log("Could not find media server at address " + argv.ws_uri);
      return callback(
        "Could not find media server at address" +
          argv.ws_uri +
          ". Exiting with error " +
          error
      );
    }

    kurentoClient = _kurentoClient;
    callback(null, kurentoClient);
  });
}

// The webpage is hosted on port 3000 and Socket.io is also on port 3000
http.listen(3000, function () {
  console.log("Example app listening on port 3000!");
});
