import React from "react";
import { BrowserRouter as Router, Route } from "react-router-dom";
import { Container, Grid } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import AccountCircle from "@material-ui/icons/AccountCircle";

import CallCenter from "./CallCenter";

const useStyles = makeStyles(theme => ({
  root: {},
  container: {
    flexGrow: 1,
    display: "flex"
  },
  content: {
    flexGrow: 1,
    marginTop: theme.spacing(3)
  },
  menuButton: {
    marginRight: theme.spacing(2)
  },
  title: {
    flexGrow: 1
  }
}));

const App: React.FC = () => {
  const classes = useStyles();
  return (
    <Grid container direction="column" className={classes.root}>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            edge="start"
            className={classes.menuButton}
            color="inherit"
            aria-label="menu"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" className={classes.title}>
            WebRTC Call Center
          </Typography>
          <div>
            <IconButton
              aria-label="account of current user"
              aria-controls="menu-appbar"
              aria-haspopup="true"
              color="inherit"
            >
              <AccountCircle />
            </IconButton>
          </div>
        </Toolbar>
      </AppBar>
      <Router>
        <Container className={classes.container}>
          <Grid container spacing={3} className={classes.content}>
            <Route
              exact
              path="/"
              render={() => {
                return (
                  <Grid item xs={12}>
                    <CallCenter />
                  </Grid>
                );
              }}
            ></Route>
          </Grid>
        </Container>
      </Router>
    </Grid>
  );
};

export default App;
