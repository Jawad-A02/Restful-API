const router = module.exports = require('express').Router();

router.use('/loads', require('./lodgings'));
router.use('/boats', require('./guests'));
router.use('/users', require('./users'));