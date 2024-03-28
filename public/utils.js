class WebRtcPeerSendonly {
  constructor(options, callback) {
    this.options = options;
    this.callback = callback;

    this.peerConnection = null;
    this.initializeRTCPeerConnection();
  }

  initializeRTCPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    this.addLocalTracks();
    this.handleOnIceCandidate();
  }

  addLocalTracks() {
    const that = this;
    navigator.getUserMedia(
      { video: true, audio: false },
      function (stream) {
        that.options.localVideo.srcObject = stream;

        stream.getTracks().forEach((track) => {
          if (track.kind == "video") {
            that.peerConnection.addTrack(track, stream);
          }
        });
        that.callback(null);
        that.peerConnection.getTransceivers().forEach(function (transceiver) {
          transceiver.direction = "sendonly";
          console.log("Transceiver", transceiver);
        });
      },
      function (error) {
        console.log(`Camera capture failed. ${error}`);
      }
    );
  }

  generateOffer(onOffer) {
    console.log("generateOffer called.");

    let that = this;

    this.peerConnection.createOffer().then((o) => {
      that.peerConnection.setLocalDescription(o);
      console.log("Offer String", o.sdp);
      onOffer(null, o.sdp, null);
    });
  }

  handleOnIceCandidate() {
    const that = this;
    this.peerConnection.onicecandidate = (e) => {
      if (e.candidate instanceof RTCIceCandidate) {
        that.options.onicecandidate(e.candidate);
      }
    };
  }

  processAnswer(answer) {
    console.log("processAnswer called.");

    const description = {
      type: "answer",
      sdp: answer,
    };
    this.peerConnection.setRemoteDescription(description).then(() => {
      console.log("Answer set");
    });
  }

  addIceCandidate(candidate) {
    console.log("addIceCandidate called.");

    this.peerConnection
      .addIceCandidate(new RTCIceCandidate(candidate))
      .then(() => {
        console.log("Candidate set");
      });
  }
}

class WebRtcPeerRecvonly {
  constructor(options, callback) {
    this.options = options;
    this.callback = callback;

    this.peerConnection = null;
    this.initializeRTCPeerConnection();
  }

  initializeRTCPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
      ],
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    this.addRemoteTracks();
    this.handleOnIceCandidate();
  }

  addRemoteTracks() {
    this.peerConnection.addTransceiver("video", { direction: "recvonly" });
    this.peerConnection.addTransceiver("audio", { direction: "recvonly" });
    this.callback(null);
  }

  generateOffer(onOffer) {
    console.log("generateOffer called.");

    let that = this;

    this.peerConnection.createOffer().then((o) => {
      that.peerConnection.setLocalDescription(o);
      console.log("Offer String", o.sdp);
      onOffer(null, o.sdp, null);
    });
  }

  handleOnIceCandidate() {
    const that = this;
    this.peerConnection.onicecandidate = (e) => {
      if (e.candidate instanceof RTCIceCandidate) {
        that.options.onicecandidate(e.candidate);
      }
    };
  }

  processAnswer(answer) {
    console.log("processAnswer called.");

    const description = {
      type: "answer",
      sdp: answer,
    };
    this.peerConnection.setRemoteDescription(description).then(() => {
      console.log("Answer set, setting remote stream");

      var stream = this.peerConnection.getRemoteStreams()[0];
      this.options.remoteVideo.srcObject = stream;
      this.options.remoteVideo.load();
    });
  }

  addIceCandidate(candidate) {
    console.log("addIceCandidate called.");

    this.peerConnection
      .addIceCandidate(new RTCIceCandidate(candidate))
      .then(() => {
        console.log("Candidate set");
      });
  }
}
