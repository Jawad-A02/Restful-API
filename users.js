const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
// const cors = require('cors');

const lds = require('./loads');

const ds = require('./datastore');
const { entity } = require('@google-cloud/datastore/build/src/entity');

const datastore = ds.datastore;

router.use(bodyParser.json());

const User = "User";


function fromDatastore(item){
    item.id = item[datastore.KEY].id;
    return item;
}


/* ------------- Begin Lodging Model Functions ------------- */

async function get_users() {
    try {
        const q = datastore.createQuery(User);
        const entities = await datastore.runQuery(q);
        const users = await Promise.all(entities[0]);
        const promises = users.map(fromDatastore);
        return promises;
    } catch (err) {
        throw err; // Rethrow the error for the caller to handle if needed
    }
}


// /* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.get('/', async function(req, res){
    // Check if the request body is acceptable
    const accepts = req.accepts(['application/json']);
    if (!accepts) {
        res.status(406).send({
            "Error": "Not acceptable"
        })
        return;
    }
    const users = await get_users();
    // const filtered = users.filter((user) => user.id === '5704568633556992')
    // console.log(filtered);
    res.status(200).json(users[0]);
});



router.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({ error: `${err}` });
    } else {
      next(err); // Pass other errors to the default error handler
    }
  });

/* ------------- End Controller Functions ------------- */

module.exports = router, get_users;