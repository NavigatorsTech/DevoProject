var log4js = require("log4js");
var admin = require("firebase-admin");
var serviceAccount = require("../../fb-service-account.json");

var logger = log4js.getLogger();

var AuthService = {
  init: function () {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
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
  // Verifies a client-supplied Firebase idToken (from email/password or
  // Google sign-in - both now authenticate via the client SDK) and returns
  // the associated email. Throws if the token is missing or invalid.
  getEmailFromToken: async function (req) {
    const bearerHeader = req.headers["authorization"];

    if (!bearerHeader) {
      logger.error("AUTH: Missing token in getEmailFromToken");
      throw new Error("Not Authorized!");
    }

    const bearerToken = bearerHeader.split(" ")[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(bearerToken);
      logger.info("AUTH: User token verified for " + decodedToken.email);
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
