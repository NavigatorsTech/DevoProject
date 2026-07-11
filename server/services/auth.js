var axios = require("axios");
var log4js = require("log4js");
var admin = require("firebase-admin");
var serviceAccount = require("../../fb-service-account.json");

var endPt;
var fbAPIKey = process.env.FB_KEY;
var logger = log4js.getLogger();

var AuthService = {
  init: function () {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  },
  createUser: async function (id, pwd, callback) {
    endPt = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=";
    try {
      await axios.post(endPt + fbAPIKey, {
        email: id,
        password: pwd,
        returnSecureToken: true
      }).then(result => {
        var tokenData = {
          idToken: result.data.idToken,
          exTime: result.data.expiresIn
        };
        logger.info("******************************************************** AUTH: In createUser: " + id + " has been created ********************************************************");
        callback(tokenData);
      });
    } catch (err) {
      logger.error(
        "AUTH: IN createUser: Error Returned during Axios -> " + err
      );
      throw err;
    }
  },
  getUser: async function (id, pwd, callback) {
    endPt =
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
    try {
      await axios.post(endPt + fbAPIKey, {
        email: id,
        password: pwd,
        returnSecureToken: true
      }).then(result => {
        var tokenData = {
          idToken: result.data.idToken,
          exTime: result.data.expiresIn
        };
        callback(tokenData);
      });
      logger.info("******************************************************** AUTH: In getUser: " + id + " has logged in ********************************************************");
    } catch (err) {
      logger.error("AUTH: IN getUser: Error Returned during Axios -> " + err);
      throw err;
    }
  },
  checkUser: async function (req, userEmailID) {
    const bearerHeader = req.headers["authorization"];

    if (bearerHeader) {
      const bearer = bearerHeader.split(" ");
      const bearerToken = bearer[1];

      // idToken comes from the client app
      await admin.auth().verifyIdToken(bearerToken).then(function (decodedToken) {
        logger.info("AUTH: User token verified");

        if (userEmailID) {
          if (decodedToken.email !== userEmailID) {
            logger.error("AUTH: User Email Mismatch");
            throw new Error("Not Authorized!");
          }
        }
        return;
      }).catch(function (error) {
        logger.error("AUTH: Token Error");
        throw new Error("Not Authorized!");
      });
    }
    // console.log(req.headers['cookie']);
  },
  // Verifies a client-supplied Firebase idToken (e.g. from Google sign-in) and
  // returns the associated email. Throws if the token is missing or invalid.
  getEmailFromToken: async function (req) {
    const bearerHeader = req.headers["authorization"];

    if (!bearerHeader) {
      logger.error("AUTH: Missing token in getEmailFromToken");
      throw new Error("Not Authorized!");
    }

    const bearerToken = bearerHeader.split(" ")[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(bearerToken);
      logger.info("AUTH: Google user token verified");
      return decodedToken.email;
    } catch (error) {
      logger.error("AUTH: Token Error");
      throw new Error("Not Authorized!");
    }
  },
  checkPlanOwnership: async function (req, planCreator, isOwner) {
    const bearerHeader = req.headers["authorization"];

    if (bearerHeader) {
      const bearer = bearerHeader.split(" ");
      const bearerToken = bearer[1];

      await admin.auth().verifyIdToken(bearerToken).then(function (decodedToken) {
        if (decodedToken.email === planCreator) {
          isOwner(true);
        } else {
          isOwner(false);
        }
      }).catch(function (error) {
        logger.error("AUTH: Token Error");
        throw new Error("Not Authorized!");
      });
    }
  }
};

module.exports = AuthService;
