const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const cors = require('cors');

const ds = require('./datastore');
const { entity } = require('@google-cloud/datastore/build/src/entity');

const datastore = ds.datastore;

router.use(bodyParser.json());

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const User = "User";
const CLIENT_ID = 'tDzXifN90K0CkCOUPEZVTJKJPLkGy7sk';
const CLIENT_SECRET = 'C4ohR_A6pD1U6vwC3WuoWIxwGptovMrSG4WWvkVPtWF3cjq55uo2pcNFb_RHj8OR';
const DOMAIN = 'abdullaj-hw7.us.auth0.com';

const { auth } = require('express-openid-connect');
const config = {
  authRequired: false,
  auth0Logout: true,
  baseURL: 'http://localhost:8080',
  clientID: `${CLIENT_ID}`,
  issuerBaseURL: `https://${DOMAIN}`,
  secret: CLIENT_SECRET
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
router.use(cors());

router.use(auth(config));
router.use(bodyParser.json());

const { requiresAuth } = require('express-openid-connect');


/* ------------- Begin Lodging Model Functions ------------- */
async function post_user(req, name, sub) {
    try {
        const key_id = parseInt(sub.split("|")[1]);
        const truncatedNumber = Number(String(key_id).substring(0, 16));
        const key = datastore.key(User, truncatedNumber);
        const data = { "name": name, "token": req.oidc.idToken, "sub": sub, "boats": []};
        let id;

        await datastore.save({ "key": key, "data": data });
        id = key.id;
        data.id = id;
        data.self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${id}`;
        await datastore.save({ "key": key, "data": data });

        return key;
    } catch (error) {
        // Handle errors here
        console.error(error);
        throw error; // Rethrow the error for the caller to handle if needed
    }
}


// /* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// req.isAuthenticated is provided from the auth router
router.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        console.log("we here");
       return res.redirect('/profile');
    }
    res.status(401).json({"Error": "Not logged in"});
 });


router.get('/profile', requiresAuth(), async(req, res) => {
    try {
        if (!req.oidc.isAuthenticated()) {
            res.status(401).json({"Error": "Not logged in"});
        }
        console.log("this is profile");
        const user = await post_user(req, req.oidc.user.name, req.oidc.user.sub);
        res.status(200).json({"id": req.oidc.idToken});
    } catch {
        console.log(error);
        res.status(500).end();
    }
});


/* ------------- End Controller Functions ------------- */

module.exports = router;