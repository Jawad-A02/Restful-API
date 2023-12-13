const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const cors = require('cors');
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const lds = require('./loads');

const ds = require('./datastore');
const { entity } = require('@google-cloud/datastore/build/src/entity');

const datastore = ds.datastore;

const USER = "User";
const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());

const CLIENT_ID = 'tDzXifN90K0CkCOUPEZVTJKJPLkGy7sk';
const CLIENT_SECRET = 'C4ohR_A6pD1U6vwC3WuoWIxwGptovMrSG4WWvkVPtWF3cjq55uo2pcNFb_RHj8OR';
const DOMAIN = 'abdullaj-hw7.us.auth0.com';


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

/* ------------- Begin boat Model Functions ------------- */

async function post_boat(req, name, type, length, owner) {
    try {
        var key = datastore.key(BOAT);
        const data = { "name": name, "type": type, "length": length, "loads": [], owner: owner};
        let id;

        await datastore.save({ "key": key, "data": data });
        id = key.id;
        data.self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${id}`;
        await datastore.save({ "key": key, "data": data });
        
        const users = await get_users();
        const filtered = users.filter((user) => user.sub === 'google-oauth2|114935712250840892898')
        data.id = id;
        filtered[0].boats.push(data);
        const user_key = datastore.key([USER, parseInt(filtered[0].id, 10)]);
        await datastore.save({"key": user_key, "data": filtered[0]});

        return key;
    } catch (error) {
        console.error(error);
    }
}

async function get_boats(req, owner) {
    const q = datastore.createQuery(BOAT)
        .filter("owner", "=", owner)
        .limit(5);

    const results = {};

    if (Object.keys(req.query).includes("cursor")) {
        q.start(req.query.cursor);
    }

    const entities = await datastore.runQuery(q);
    results.boats = entities[0].map(ds.fromDatastore);

    if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
        results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
    }

    return results;
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
            return entity.map(ds.fromDatastore);
        }
    });
}

async function get_users() {
    try {
        const q = datastore.createQuery(USER);
        const entities = await datastore.runQuery(q);
        const users = await Promise.all(entities[0]);
        const promises = users.map(ds.fromDatastore);
        return promises;
    } catch (err) {
        throw err; // Rethrow the error for the caller to handle if needed
    }
}

function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(ds.fromDatastore);
        }
    });
}



async function put_boat_load(id, loadid) {
    try {
        const load = await get_load(loadid);
        if (load[0].carrier !== null) {
            return null;
        } else {
            const boat = await get_boat(id);
            console.log(load[0].id);
            boat[0].loads.push(load[0]);

            const boat_key = datastore.key([BOAT, parseInt(id, 10)]);
            await datastore.save({"key": boat_key, "data": boat[0]});

            load[0].carrier = {
                "name": boat[0].name,
                "id": boat[0].id,
                "self": boat[0].self
            };

            const load_key = datastore.key([LOAD, parseInt(loadid, 10)]);
            await datastore.save({"key": load_key, "data": load[0]});

            return load[0];
        }
    } catch (error) {
        console.error('Error in put_boat_load:', error);
        throw error; // Re-throw the error to handle it at a higher level
    }
}

async function del_boat_load(id, load_id){
    try {
        const load = await get_load(load_id);
        const boat = await get_boat(id);
        if (load[0].carrier === null || load[0].carrier.name !== boat[0].name) {
            return null;
        } else {
            boat[0].loads = boat[0].loads.filter(object => object.id !== load[0].id);

            const boat_key = datastore.key([BOAT, parseInt(id, 10)]);
            await datastore.save({"key": boat_key, "data": boat[0]});

            load[0].carrier = null;

            const load_key = datastore.key([LOAD, parseInt(load_id, 10)]);
            await datastore.save({"key": load_key, "data": load[0]});

            return load[0];
        }
    } catch (error) {
        console.error('Error in put_boat_load:', error);
        throw error; // Re-throw the error to handle it at a higher level
    }
}

async function del_boat(id) {
    const key = await datastore.key([BOAT, parseInt(id, 10)]);
    const boat = await get_boat(id);
    const ids = [];
    if (boat[0].loads.length !== 0) {
        for (let i = 0; i < boat[0].loads.length; i++) {
            ids.push(boat[0].loads[i].id);
        }
        for (let i = 0; i < ids.length; i++) {
            const load = await get_load(ids[i]);
            if (load[0] && load[0].carrier) {
                load[0].carrier = null;
                const load_key = await datastore.key([LOAD, parseInt(ids[i], 10)]);
                await datastore.save({"key": load_key, "data": load[0]});
            }
        }    
    }
    await del_user_boat(id, boat[0].owner);
    return datastore.delete(key);

}

async function del_user_boat(id, sub) {
    const users = await get_users();
    
    // Find the user with the given 'sub'
    const userIndex = users.findIndex((user) => user.sub === sub);
    const boatIndex = users[userIndex].boats.findIndex((boat) => boat.id === id);
    
    // Remove the boat from the user's boats array
    users[userIndex].boats.splice(boatIndex, 1);
    
    // Save the updated user to the datastore
    const userKey = datastore.key([USER, parseInt(users[userIndex].id, 10)]);
    await datastore.save({ "key": userKey, "data": users[userIndex] });
}

async function edit_boat(id, data) {
    try {
        const key = datastore.key([BOAT, parseInt(id, 10)]);
        await datastore.save({"key": key, "data": data});
        const entities = await datastore.get(key);
        return entities.map(ds.fromDatastore);
    } catch (err) {
        console.log(err)
    }
}

function accept_json(req) {
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        return false;
    } else {
        return true;
    }
};
/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', checkJwt, async function(req, res){
    // Check if the request body is acceptable
    if (!accept_json(req)) {
        res.status(406).send({"Error": "Not acceptable"})
        return;
    }

    console.log(req.user.sub);
    const boats = await get_boats(req, req.user.sub)
    res.contentType("application/json");
	res.status(200).json(boats);
});


router.use(async (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json("Error: You are not authorized to access this resource");
    } else {
        next(err); 
    }
});

router.post('/', checkJwt, async function(req, res){
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }
        let name = req.body.name;
        let type = req.body.type;
        let length = req.body.length;
        let owner = req.user.sub;
        if (name === undefined || type === undefined || length === undefined) {
            res.status(400).json({
                "Error": "The request object is missing at least one of the required attributes"
            })
            return;
        }

        // Check if the request body contains all the required attributes
        for (let key in req.body) {
            if (key !== "name" && key !== "type" && key !== "length") {
                res.status(400).json({"Error": "The request object contains at least one unaccepted attribute"});
                return;
            }
        }

        const key = await post_boat(req, name, type, length, owner);
        const boat = await get_boat(key.id);
        res.status(201).json(boat[0]);
    } catch (err) {
        console.log(err);
    }
});


router.get('/:boat_id', checkJwt, async function (req, res) {
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }

        const boat = await get_boat(req.params.boat_id);  // Use req.params.boat_id here

        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "The specified boat and/or load does not exist\\it is owned by someone else"});
        } else {
            res.contentType("application/json");
            res.status(200).json(boat[0]);
        }
    } catch (err) {
        console.log(err);
    }
});


router.put('/:id', checkJwt, async function(req, res) {
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }

        if(req.get('content-type') !== 'application/json'){
            res.status(415).json({"Error": 'Server only accepts application/json data.'});
            return;
        }
        
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "The specified boat and/or load does not exist\\it is owned by someone else"});
        } else {
                if (!req.body.name || !req.body.type || !req.body.length) {
                    res.status(400).json({
                        "Error": "The request object is missing at least one of the required attributes"
                    })
                    return;
                }

            for (let key in req.body) {
                if (key === "name") {
                    boat[0].name = req.body[key];
                } else if (key === "type") {
                    boat[0].type = req.body[key];
                } else if (key === "length") {
                    boat[0].length = req.body[key]
                } else {
                    res.status(400).json({"Error": "The request object contains at least one unaccepted attributes"})
                    return;
                }
            }

            const updated_boat = await edit_boat(req.params.id, boat[0]);
            res.contentType("application/json");
            res.status(200).json(updated_boat[0])
        }
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
});


router.put('/:id/loads/:loadid', checkJwt, async function(req, res) {
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }

        console.log(req.params.id);
        const boat = await get_boat(req.params.id);
        console.log(boat);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "The specified boat and/or load does not exist\\it is owned by someone else"});
        } else {
            const load = await get_load(req.params.loadid);
            if (load[0] == undefined || load[0] == null) {
                res.status(403).json({"Error": "The specified boat and/or load does not exist"});
            } else {
                const result = await put_boat_load(req.params.id, req.params.loadid);
                if (result === null) {
                    res.status(403).json({"Error": "The load is already loaded on another boat"});
                } else {
                    res.status(204).end();
                }
            }
        }
    } catch (error) {
        console.log(error);
        res.status(500).end();
    }
});

router.patch('/:id', checkJwt, async function(req, res) {
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }

        if(req.get('content-type') !== 'application/json'){
            res.status(415).json({"Error": 'Server only accepts application/json data.'});
            return;
        }
        
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "The specified boat and/or load does not exist\\it is owned by someone else"});
        } else {
                
            for (let key in req.body) {
                if (key === "name") {
                    boat[0].name = req.body[key];
                } else if (key === "type") {
                    boat[0].type = req.body[key];
                } else if (key === "length") {
                    boat[0].length = req.body[key]
                } else {
                    res.status(400).json({"Error": "The request object contains at least one unaccepted attributes"})
                    return;
                }
            }


            const updated_boat = await edit_boat(req.params.id, boat[0])
            res.contentType("application/json");
            res.status(200).json(updated_boat[0])

        }
    } catch (error) {
        console.log(error);
        res.status(500).end();
    }
});

router.delete('/:id/loads/:load_id', checkJwt, async function(req, res){
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "The specified boat and/or load does not exist\\it is owned by someone else"});
        } else {
            const load = await get_load(req.params.load_id);
            if (load[0] == undefined || load[0] == null) {
                res.status(403).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
            } else {
                const result = await del_boat_load(req.params.id, req.params.load_id);
                if (result === null) {
                    res.status(403).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
                } else {
                    res.status(204).end();
                }
            }
        }
    } catch (error) {
        console.log(error);
        res.status(500).end();
    }
});

router.delete('/:id',checkJwt, async function(req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({"Error": "The specified boat and/or load does not exist\\it is owned by someone else"})
        } else {
            del_boat(req.params.id);
            res.status(204).end()
        }
    } catch (error) {
        console.log(error)
    }
})

router.get('/:id/loads', checkJwt, async function(req, res) {
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null || boat[0].owner !== req.user.sub) {
            res.status(403).json({ "Error": "The specified boat and/or load does not exist\\it is owned by someone else"});
        } else {
            res.contentType("application/json");
            res.status(200).json(boat[0]);
        }
    } catch (error) {
        console.log(error)
    }
})

router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.patch('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({ error: `${err}` });
    } else {
      next(err); // Pass other errors to the default error handler
    }
  });

/* ------------- End Controller Functions ------------- */

module.exports = router;