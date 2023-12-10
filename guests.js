const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const lds = require('./lodgings');

const ds = require('./datastore');
const { entity } = require('@google-cloud/datastore/build/src/entity');

const datastore = ds.datastore;

const BOAT = "Boat";
const LOAD = "Load";

router.use(bodyParser.json());


/* ------------- Begin guest Model Functions ------------- */

function post_boat(req, name, type, length) {
    var key = datastore.key(BOAT);
    console.log(`this is the key ${key}`);
    const data = { "name": name, "type": type, "length": length, "loads": []};
    let id;

    return datastore.save({ "key": key, "data": data})
        .then(() => {
            id = key.id; 
            console.log(id);
            data.self = `${req.protocol}://${req.get("host")}${req.baseUrl}/${id}`;
            return datastore.save({"key": key, "data": data});
        })
        .then(() => {
            return key; 
        });
}

function get_boats(req) {
    var q = datastore.createQuery(BOAT).limit(3);
    const results = {};

    if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
    }

	return datastore.runQuery(q).then( (entities) => {
        results.boats = entities[0].map(ds.fromDatastore);

        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
};

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
            boat[0].loads.push({
                "id": load[0].id,
                "self": load[0].self
            });

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
    return datastore.delete(key);
}


/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', function(req, res) {
    const boats = get_boats(req)
    .then( (boats) => {
        res.status(200).json(boats);
    })
});

router.post('/', function(req, res){
    const name = req.body.name;
    const type = req.body.type;
    const length = req.body.length;
    if (name === undefined || type === undefined || length === undefined) {
        res.status(400).send({
            "Error": "The request object is missing at least one of the required attributes"
        })
        return;
    }
    post_boat(req, name, type, length)
        .then((key) => {
            console.log(key.id);
            get_boat(key.id)
            .then(boat => {
                console.log(boat);
                res.status(201).json(boat[0]);
            });
        });
});

router.get('/:id', async function (req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } else {
            res.status(200).json(boat[0]);
        }
    } catch (err) {
        console.log(err);
    }
});

router.put('/:id/loads/:loadid', async function(req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null) {
            res.status(404).json({"Error": "The specified boat and/or load does not exist"});
        } else {
            const load = await get_load(req.params.loadid);
            if (load[0] == undefined || load[0] == null) {
                res.status(404).json({"Error": "The specified boat and/or load does not exist"});
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

router.delete('/:id/loads/:load_id', async function(req, res){
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null) {
            res.status(404).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
        } else {
            const load = await get_load(req.params.load_id);
            if (load[0] == undefined || load[0] == null) {
                res.status(404).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
            } else {
                const result = await del_boat_load(req.params.id, req.params.load_id);
                if (result === null) {
                    res.status(404).json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
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

router.delete('/:id', async function(req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null) {
            res.status(404).json({"Error": "No boat with this boat_id exists"})
        } else {
            del_boat(req.params.id);
            res.status(204).end()
        }
    } catch (error) {
        console.log(error)
    }
})

router.get('/:id/loads', async function(req, res) {
    try {
        const boat = await get_boat(req.params.id);
        if (boat[0] == undefined || boat[0] == null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } else {
            res.status(200).json(boat[0]);
        }
    } catch (error) {
        console.log(error)
    }
})

/* ------------- End Controller Functions ------------- */

module.exports = router;