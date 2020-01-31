import React, { useState } from "react";
import { Paper, TextField, Typography, Grid } from "@material-ui/core";
import { createStyles, makeStyles } from "@material-ui/core/styles";

import Status from "./Status";
import CallControl from "./CallControl";

const useStyles = makeStyles(theme =>
  createStyles({
    root: { flexGrow: 1 },
    paper: { padding: theme.spacing(3, 5) }
  })
);

const CallCenter: React.FC = () => {
  const [online, setOnline] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const classes = useStyles();

  const handleOnlineChange = (online: boolean) => {
    console.log(`online: ${online}`);
    setOnline(online);
  };

  const handleCallActiveChange = (callActive: boolean) => {
    console.log(`callActive: ${callActive}`);
    setCallActive(callActive);
  };

  return (
    <Grid container className={classes.root} spacing={4}>
      <Grid container spacing={4} item xs={6}>
        <Grid item xs={12}>
          <Status online={online} onOnlineChange={handleOnlineChange}></Status>
        </Grid>
        <Grid item xs={12}>
          <CallControl
            online={online}
            onCallActiveChange={handleCallActiveChange}
          ></CallControl>
        </Grid>
      </Grid>
      {callActive ? (
        <Grid item xs={6}>
          <Paper className={classes.paper}>
            <Typography variant="h5">Call notes</Typography>
            <TextField
              fullWidth
              id="standard-textarea"
              multiline
              margin="normal"
            />
          </Paper>
        </Grid>
      ) : (
        undefined
      )}
    </Grid>
  );
};

export default CallCenter;
