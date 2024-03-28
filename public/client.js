// getting dom elements
var divRoomSelection = document.getElementById('roomSelection');
var divMeetingRoom = document.getElementById('meetingRoom');
var inputRoom = document.getElementById('room');
var inputName = document.getElementById('name');
var btnRegister = document.getElementById('register');

// variables
var roomName;
var userName;
var participants = {};

// Let's do this
var socket = io();

btnRegister.onclick = function () {
    roomName = inputRoom.value;
    userName = inputName.value;

    if (roomName === '' || userName === '') {
        alert('Room and Name are required!');
    } else {
        var message = {
            event: 'joinRoom',
            userName: userName,
            roomName: roomName
        }
        sendMessage(message);
        divRoomSelection.style = "display: none";
        divMeetingRoom.style = "display: block";
    }
}

// messages handlers
socket.on('message', message => {
    console.log('Message received: ' + message.event);

    console.log("SOCKET_EVENT", message.event, message);

    switch (message.event) {
        case 'newParticipantArrived':
            receiveVideo(message.userid, message.username);
            break;
        case 'existingParticipants':
            onExistingParticipants(message.userid, message.existingUsers);
            break;
        case 'receiveVideoAnswer':
            onReceiveVideoAnswer(message.senderid, message.sdpAnswer);
            break;
        case 'candidate':
            addIceCandidate(message.userid, message.candidate);
            break;
    }
});

// handlers functions
function receiveVideo(userid, username) {
    var video = document.createElement('video');
    var div = document.createElement('div');
    div.className = "videoContainer";
    var name = document.createElement('div');
    var consoleDiv = document.createElement('div');
    consoleDiv.className = "console";
    video.id = userid;
    video.autoplay = true;
    name.appendChild(document.createTextNode("Receive Video " + username));
    div.appendChild(video);
    div.appendChild(name);
    div.appendChild(consoleDiv);
    divMeetingRoom.appendChild(div);

    var user = {
        id: userid,
        username: username,
        video: video,
        consoleDiv: consoleDiv,
        rtcPeer: null
    }

    participants[user.id] = user;

    var options = {
        remoteVideo: video,
        onicecandidate: onIceCandidate
    }

    var onOffer = function (err, offer, wp) {
        var message = {
            event: 'receiveVideoFrom',
            userid: user.id,
            roomName: roomName,
            sdpOffer: offer
        }
        sendMessage(message);
    }

    user.rtcPeer = new WebRtcPeerRecvonly(options,
        function (err) {
            if (err) {
                return console.log(err);
            }
            this.generateOffer(onOffer);
        }
    )

    const pc = user.rtcPeer.peerConnection

    pc.onconnectionstatechange = (ev) => {
        console.log("onconnectionstatechange", ev);
        switch(pc.connectionState) {
          case "new":
          case "checking":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Connecting…</strong><br><br>`;
            break;
          case "connected":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Online </strong><br><br>`
            break;
          case "disconnected":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Disconnecting… </strong><br><br>`
            break;
          case "closed":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Offline </strong><br><br>`
            break;
          case "failed":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Error </strong><br><br>`
            break;
          default:
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Unknown </strong><br><br>`
            break;
        }
    }

    function onIceCandidate(candidate, wp) {
        var message = {
            event: 'candidate',
            userid: user.id,
            roomName: roomName,
            candidate: candidate
        }
        sendMessage(message);
    }
}

// This is called first
// Your own stream is added here (it is played directly)
// Receive video is called for all other clients
function onExistingParticipants(userid, existingUsers) {

    console.log("i--- onExistingParticipants called");

    var video = document.createElement('video');
    var div = document.createElement('div');
    div.className = "videoContainer";
    var name = document.createElement('div');
    var consoleDiv = document.createElement('div');
    consoleDiv.className = "console";
    video.id = userid;
    video.autoplay = true;
    name.appendChild(document.createTextNode("onExistingParticipant " + userName));
    div.appendChild(video);
    div.appendChild(name);
    div.appendChild(consoleDiv);
    divMeetingRoom.appendChild(div);

    var user = {
        id: userid,
        username: userName,
        video: video,
        consoleDiv: consoleDiv,
        rtcPeer: null
    }

    participants[user.id] = user;

    var constraints = {
        audio: true,
        video : {
			mandatory : {
				maxWidth : 320,
				maxFrameRate : 15,
				minFrameRate : 15
			}
		}
    };

    var options = {
        localVideo: video,
        mediaConstraints: constraints,
        onicecandidate: onIceCandidate
    }

    var onOffer = function (err, offer, wp) {
        console.log('---sending offer(sendonly)', offer);
        var message = {
            event: 'receiveVideoFrom',
            userid: user.id,
            roomName: roomName,
            sdpOffer: offer
        }
        sendMessage(message);
    }

    user.rtcPeer = new WebRtcPeerSendonly(options,
        function (err) {
            if (err) {
                return console.error(err);
            }
            this.generateOffer(onOffer)
        }
    );

    const pc = user.rtcPeer.peerConnection

    pc.onconnectionstatechange = (ev) => {
        console.log("onconnectionstatechange", ev);
        switch(pc.connectionState) {
          case "new":
          case "checking":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Connecting…</strong><br><br>`;
            break;
          case "connected":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Online </strong><br><br>`
            break;
          case "disconnected":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Disconnecting… </strong><br><br>`
            break;
          case "closed":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Offline </strong><br><br>`
            break;
          case "failed":
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Error </strong><br><br>`
            break;
          default:
            user.consoleDiv.innerHTML += `<strong>Peer connection(${user.id}) state change: Unknown </strong><br><br>`
            break;
        }
    }

    // This is for every other client. They will receive data
    existingUsers.forEach(function (element) {
        receiveVideo(element.id, element.name);
    });

    function onIceCandidate(candidate, wp) {
        console.log('---sending ice candidates(sendonly)', candidate);
        var message = {
            event: 'candidate',
            userid: user.id,
            roomName: roomName,
            candidate: candidate
        }
        sendMessage(message);
    }
}

function onReceiveVideoAnswer(senderid, sdpAnswer) {
    // sdpAnswer is simple sdp string
    console.log("onReceiveVideoAnswer", senderid, sdpAnswer);
    participants[senderid].rtcPeer.processAnswer(sdpAnswer);
    participants[senderid].consoleDiv.innerHTML += `onReceiveVideoAnswer: ${sdpAnswer} <br><br>`
}

function addIceCandidate(userid, candidate) {
    // candidate is candidate json object
    console.log("addIceCandidate", userid, candidate);
    participants[userid].rtcPeer.addIceCandidate(candidate);
    participants[userid].consoleDiv.innerHTML += `onIceCandidate: ${candidate.candidate} <br><br>`
}

// utilities
function sendMessage(message) {
    console.log('sending ' + message.event + ' message to server');
    console.log('sending message-content', message)
    socket.emit('message', message);
}
