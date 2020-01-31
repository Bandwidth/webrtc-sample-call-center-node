import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Paper, Typography, Grid } from "@material-ui/core";
import { MicOff, Phone } from "@material-ui/icons";
import { makeStyles } from "@material-ui/core/styles";
import moment from "moment";
import BandwidthRtc, {
  RtcStream,
  SubscriptionEvent
} from "@bandwidth/webrtc-browser-sdk";

const bandwidthRtc = new BandwidthRtc();
const backendUrl = '';

type IProps = {
  online: boolean;
  onCallActiveChange?: (online: boolean) => void | undefined;
};


const useStyles = makeStyles(theme => ({
  paper: {
    padding: theme.spacing(3, 5)
  },
  callElement: {
    display: "none"
  },
  hiddenVideo: {
    display: "none"
  }
}));

const CallControl: React.FC<IProps> = props => {
  const classes = useStyles();
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [callDuration, setCallDuration] = useState("00:00");
  const [token, setToken] = useState();
  const [callerId, setCallerId] = useState();
  const [callActive, setCallActive] = useState(false);
  const [callTimer, setCallTimer] = useState();
  const callElement = useRef<HTMLElement>();
  const [remoteStream, setRemoteStream] = useState<RtcStream>();

  const connectToConference = async (conferenceId: string, participantId: string) => {
    let options: any = {};
    await bandwidthRtc.connect({conferenceId: conferenceId, participantId: participantId}, options);

    bandwidthRtc.onSubscribe((stream: RtcStream) => {
      handleCallStarted(stream);
    });
    bandwidthRtc.onUnsubscribe((event: SubscriptionEvent) => {
      handleCallEnded(event);
    });

    await bandwidthRtc.publish({audio: true});
  };

  const handleCallStarted = (stream: RtcStream) => {
    // TODO: update this to work for GA
    // let incomingCallerId = JSON.parse(stream.connection.data).clientData;
    // setCallerId(incomingCallerId);
    if (callElement) {
      setRemoteStream(stream);
      setStartTimestamp(moment().valueOf());
      setCallActive(true);
    }
  };

  const handleCallEnded = (event: any) => {
    setRemoteStream(undefined);
    setCallActive(false);
    setCallDuration("00:00");
  };

  const hangup = async () => {
    if (callActive) {
      await fetch(`${backendUrl}/hangup`, {
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        body: JSON.stringify({token: token})
      });
      setCallActive(false);
    }
  };

  useEffect(() => {
    if (props.onCallActiveChange) {
      props.onCallActiveChange(callActive);
    }
  }, [callActive]);

  useEffect(() => {
    if (callActive) {
      setCallTimer(
        setInterval(() => {
          let startTime = moment(startTimestamp);
          let duration = moment.duration(moment().diff(startTime));
          setCallDuration(
            `${duration
              .minutes()
              .toString()
              .padStart(2, "0")}:${duration
              .seconds()
              .toString()
              .padStart(2, "0")}`
          );
        }, 1000)
      );
    } else {
      if (callTimer) {
        setCallTimer(clearInterval(callTimer));
      }
    }
  }, [callActive]);

  useEffect(() => {
    fetch(`${backendUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }).then(response => {
      response.json().then((data) => {
        setToken(data.token);
      });
    });
  }, []);

  useEffect(() => {
    if (token) {
      fetch(`${backendUrl}/setStatus`, {
        method: "POST",
        body: JSON.stringify({ token: token, online: props.online }),
        headers: {
          "Content-Type": "application/json"
        }
      }).then(response => {
        response.json().then((data) => {
          if (props.online) {
            connectToConference(data.conferenceId, data.participantId);
          } else if (bandwidthRtc !== undefined) {
            bandwidthRtc.disconnect();
          }
        });
      });
    }
  }, [props.online]);

  return (
    props.online ?
    <Box>
      <Paper className={classes.paper}>
        {callActive ? (
          <Box>
            <Typography variant="h5">Active call</Typography>
            <Typography variant="h6">{callerId}</Typography>
            <Typography>John Doe</Typography>
            <Typography>9375 Rocky Road</Typography>
            <Typography>Timbuktu, CO 58347</Typography>
            <Typography>{callDuration}</Typography>
            <Grid container spacing={1}>
              <Grid item>
                <Button variant="contained" startIcon={<MicOff />} disabled>
                  Mute
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<Phone />}
                  onClick={hangup}
                >
                  End Call
                </Button>
              </Grid>
            </Grid>
          </Box>
        ) : (
          <Box>
            <Typography variant="h5">No active call</Typography>
            <Typography>Waiting for incoming calls...</Typography>
          </Box>
        )}
      </Paper>
      <Paper className={classes.callElement}>
        <video
          playsInline
          autoPlay
          className={classes.hiddenVideo}
          ref={callElement => {
            if (
              callElement &&
              remoteStream &&
              callElement.srcObject !==
                remoteStream.mediaStream
            ) {
              callElement.srcObject = remoteStream.mediaStream;
            }
          }}
        ></video>
      </Paper>
    </Box> : null
  );
};

export default CallControl;
