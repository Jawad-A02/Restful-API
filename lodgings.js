const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const ds = require('./datastore');

const datastore = ds.datastore;

const LOAD = "Load";
const BOAT = "Boat";

router.use(bodyParser.json());



/* ------------- Begin Lodging Model Functions ------------- */

function post_load(req, volume, item, date) {
    var key = datastore.key(LOAD);
    const data = { "volume": volume, "item": item, "creation_date": date,
         "carrier": null};
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

function get_loads(req) {
    var q = datastore.createQuery(LOAD).limit(3);
    const results = {};

    if (Object.keys(req.query).includes("cursor")) {
    q = q.start(req.query.cursor);
    }

	return datastore.runQuery(q).then( (entities) => {
        results.loads = entities[0].map(ds.fromDatastore);

        if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
};

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

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', async function(req, res) {
    const loads = get_loads(req)
    .then( (loads) => {
        res.status(200).json(loads);
    })
});

router.post('/', async function(req, res){
    const volume = req.body.volume;
    const item = req.body.item;
    const date = req.body.creation_date;
    if (volume === undefined || item === undefined || date === undefined) {
        res.status(400).send({
            "Error": "The request object is missing at least one of the required attributes"
        })
        return;
    }
    post_load(req, volume, item, date)
        .then((key) => {
            console.log(key.id);
            get_load(key.id)
            .then(load => {
                console.log(load);
                res.status(201).json(load[0]);
            });
        });
});

router.get('/:id', async function (req, res) {
    try {
        const load = await get_load(req.params.id);
        if (load[0] == undefined || load[0] == null) {
            res.status(404).json({ 'Error': 'No load with this load_id exists' });
        } else {
            res.status(200).json(load[0]);
        }
    } catch (err) {
        console.log(err);
    }
});

router.delete('/:id', async function(req, res) {
    try {
        const load = await get_load(req.params.id);
        if (load[0] == undefined || load[0] == null) {
            res.status(404).json({"Error": "No load with this load_id exists"})
        } else {
            del_load(req.params.id);
            res.status(204).end()
        }
    } catch (error) {
        console.log(error);
        res.status(500).end();
    }
})

/* ------------- End Controller Functions ------------- */

module.exports = router;