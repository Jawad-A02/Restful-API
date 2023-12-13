const router = module.exports = require('express').Router();


router.use('/loads', require('./loads'));
router.use('/boats', require('./boats'));
router.use('/users', require('./users'));
router.use('/', require('./login'));