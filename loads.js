const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

const LOAD = "Load";
const BOAT = "Boat";

router.use(bodyParser.json());



/* ------------- Begin Lodging Model Functions ------------- */

async function post_load(req, volume, item, date) {
    try {
        var key = datastore.key(LOAD);
        const data = { "volume": volume, "item": item, "creation_date": date,
            "carrier": null};
        let id; 

        await datastore.save({ "key": key, "data": data});
        id = key.id; 
        console.log(id);
        data.self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${id}`;
        await datastore.save({"key": key, "data": data});
        
        return key; 
    } catch {
        console.log(error);
    }
}

async function get_loads(req) {
    const q = datastore.createQuery(LOAD).limit(5);

    const results = {};

    if (Object.keys(req.query).includes("cursor")) {
        q.start(req.query.cursor);
    }

    const entities = await datastore.runQuery(q);
    results.loads = entities[0].map(ds.fromDatastore);

    if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
        results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
    }

    return results;
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

async function del_load(id) {
    const key = await datastore.key([LOAD, parseInt(id, 10)]);
    const load = await get_load(id);
    let boat_id = undefined;
    if (load[0].carrier) {
        boat_id = load[0].carrier.id;

        const boat = await get_boat(boat_id);
        boat[0].loads = boat[0].loads.filter(object => object.id !== load[0].id);
        const boat_key = await datastore.key([BOAT, parseInt(boat_id, 10)]);
        await datastore.save({"key": boat_key, "data": boat[0]});
    }
    return datastore.delete(key);
}

async function edit_load(id, data) {
    try {
        const key = datastore.key([LOAD, parseInt(id, 10)]);
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

router.get('/', async function(req, res) {
    if (!accept_json(req)) {
        res.status(406).send({"Error": "Not acceptable"})
        return;
    }
    const loads = await get_loads(req)
    res.contentType("application/json");
	res.status(200).json(loads);
});

router.post('/', async function(req, res){
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }

        const volume = req.body.volume;
        const item = req.body.item;
        const date = req.body.creation_date;
        if (volume === undefined || item === undefined || date === undefined) {
            res.status(400).send({
                "Error": "The request object is missing at least one of the required attributes"
            })
            return;
        }
        // Check if the request body contains all the required attributes
        for (let key in req.body) {
            if (key !== "volume" && key !== "item" && key !== "creation_date") {
                res.status(400).json({"Error": "The request object contains at least one unaccepted attribute"});
                return;
            }
        }

        const key = await post_load(req, volume, item, date);
        const load = await get_load(key.id);
        res.contentType("application/json");
        res.status(201).json(load[0]);

        } catch (error) {
            console.log(error);
            res.status(500).end();
        }
});

router.get('/:id', async function (req, res) {
    try {
        // Check if the request body is acceptable
        if (!accept_json(req)) {
            res.status(406).send({"Error": "Not acceptable"})
            return;
        }

        const load = await get_load(req.params.id);
        if (load[0] == undefined || load[0] == null) {
            res.status(403).json({ 'Error': 'No load with this load_id exists' });
        } else {
            res.contentType("application/json");
            res.status(200).json(load[0]);
        }
    } catch (err) {
        console.log(err);
    }
});


router.put('/:id', async function(req, res) {
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
        
        const load = await get_load(req.params.id);
        if (load[0] == undefined || load[0] == null) {
            res.status(403).json({"Error": "The specified load does not exist"});
        } else {
                if (!req.body.volume || !req.body.item || !req.body.creation_date) {
                    res.status(400).json({
                        "Error": "The request object is missing at least one of the required attributes"
                    })
                    return;
                }

            for (let key in req.body) {
                if (key === "volume") {
                    load[0].volume = req.body[key];
                } else if (key === "item") {
                    load[0].item = req.body[key];
                } else if (key === "creation_date") {
                    load[0].creation_date = req.body[key]
                } else {
                    res.status(400).json({"Error": "The request object contains at least one unaccepted attributes"})
                    return;
                }
            }

            const updated_load = await edit_load(req.params.id, load[0]);
            res.contentType("application/json");
            res.status(200).json(updated_load[0])
        }
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
});

router.patch('/:id', async function(req, res) {
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
        
        const load = await get_load(req.params.id);
        if (load[0] == undefined || load[0] == null) {
            res.status(403).json({"Error": "The specified load does not exist"});
        } else {

            for (let key in req.body) {
                if (key === "volume") {
                    load[0].volume = req.body[key];
                } else if (key === "item") {
                    load[0].item = req.body[key];
                } else if (key === "creation_date") {
                    load[0].creation_date = req.body[key]
                } else {
                    res.status(400).json({"Error": "The request object contains at least one unaccepted attributes"})
                    return;
                }
            }

            const updated_load = await edit_load(req.params.id, load[0]);
            res.contentType("application/json");
            res.status(200).json(updated_load[0])
        }
    } catch (err) {
        console.log(err);
        res.status(500).end();
    }
});

router.delete('/:id', async function(req, res) {
    try {
        const load = await get_load(req.params.id);
        if (load[0] == undefined || load[0] == null) {
            res.status(403).json({"Error": "No load with this load_id exists"})
        } else {
            del_load(req.params.id);
            res.status(204).end()
        }
    } catch (error) {
        console.log(error);
        res.status(500).end();
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

/* ------------- End Controller Functions ------------- */

module.exports = router;