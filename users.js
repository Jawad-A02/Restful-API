const express = require('express');
const app = express();
const cors = require('cors');

const {Datastore} = require('@google-cloud/datastore');

const bodyParser = require('body-parser');

const datastore = new Datastore();

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const BOAT = "Boat";
const CLIENT_ID = 'tDzXifN90K0CkCOUPEZVTJKJPLkGy7sk';
const CLIENT_SECRET = 'C4ohR_A6pD1U6vwC3WuoWIxwGptovMrSG4WWvkVPtWF3cjq55uo2pcNFb_RHj8OR';
const DOMAIN = 'abdullaj-hw7.us.auth0.com';


const router = express.Router();
const owner = express.Router();

const { auth } = require('express-openid-connect');

const config = {
  authRequired: false,
  auth0Logout: true,
  baseURL: 'http://localhost:8080',
  clientID: `${CLIENT_ID}`,
  issuerBaseURL: `https://${DOMAIN}`,
  secret: 'A_VERY_SUPER_SECRECT'
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(cors());

app.use(auth(config));
app.use(bodyParser.json());

const { requiresAuth } = require('express-openid-connect');

// req.isAuthenticated is provided from the auth router
app.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
       return res.redirect('/profile');
    }
    res.send('Logged out');
 });


app.get('/profile', requiresAuth(), (req, res) => {
    res.send(JSON.stringify(req.oidc.idToken));
});


function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),
  
    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
  });


/* ------------- Begin Lodging Model Functions ------------- */
async function post_boat(req, name, type, length, public, owner) {
    try {
        const key = datastore.key(BOAT);
        const data = { "name": name, "type": type, "length": length, "public": public, "owner": owner};
        let id;

        await datastore.save({ "key": key, "data": data });
        id = key.id;
        data.self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${id}`;
        await datastore.save({ "key": key, "data": data });

        return key;
    } catch (error) {
        // Handle errors here
        console.error(error);
        throw error; // Rethrow the error for the caller to handle if needed
    }
}


async function get_boats(owner, public) {
    try {
        const q = datastore.createQuery(BOAT);
        const entities = await datastore.runQuery(q);
        const boats = await Promise.all(entities[0]);
        let promises
        if (public === "owner-public") {        
            promises = boats.map(fromDatastore).filter( item => 
                item.owner === owner && item.public === true);
        } else if (public === "owner") {
            promises = boats.map(fromDatastore).filter( item => 
                item.owner === owner) 
        } else {
            promises = boats.map(fromDatastore).filter( item =>
                item.public === true)
        }

        return promises;
    } catch (err) {
        throw err; // Rethrow the error for the caller to handle if needed
    }
}


function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(fromDatastore);
        }
    });
}


function del_boat(id) {
    try {
        const key = datastore.key([BOAT, parseInt(id, 10)]);
        
        return datastore.delete(key);
    } catch (err) {
        return err;
    }
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// req.isAuthenticated is provided from the auth router
app.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
       return res.redirect('/profile');
    }
    res.send('Logged out');
 });


app.get('/profile', requiresAuth(), (req, res) => {
    res.send(JSON.stringify(req.oidc.idToken));
});


router.get('/', checkJwt, async function(req, res){
    const boats = await get_boats(req.user.sub, "owner")
	res.status(200).json(boats);
});

router.use(async (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {

        const boats = await get_boats(null, "public")
        res.status(200).json(boats);
    } else {
        next(err); // Pass other errors to the default error handler
    }
});

router.delete('/:id', checkJwt, async function(req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "No boat with this boat_id exists\\it is owned by someone else"});
        } else {
            del_boat(req.params.id);
            res.status(204).end();
        }
    } catch (error) {
        console.log(error);
        res.status(500).end();
    }
});


owner.param('owner_id', function(req, res, next, owner_id) {
    // You can perform additional logic or validation here if needed
    req.owner_id = owner_id; // Attach the parameter to the request object
    next();
});

owner.get('/:owner_id/boats', checkJwt, async function(req, res, next){
    
    const boats = await get_boats(req.owner_id, "owner-public");
    res.status(200).json(boats);
});

owner.use(async (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        const boats = await get_boats(req.owner_id, "owner-public");
        res.status(200).json(boats);
    } else {
      next(err); // Pass other errors to the default error handler
    }
});


router.post('/', checkJwt, async function(req, res){
    try {

        if(req.get('content-type') !== 'application/json'){
            res.status(415).send('Server only accepts application/json data.')
        }

        const name = req.body.name;
        const type = req.body.type;
        const length = req.body.length;
        const public = req.body.public;
        const owner = req.user.sub;

        

        const key = await post_boat(req, name, type, length, public, owner)
        res.status(201).json({"id": key.id});
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
});

router.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({ error: `${err}` });
    } else {
      next(err); // Pass other errors to the default error handler
    }
  });