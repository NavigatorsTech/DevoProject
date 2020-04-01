var express = require('express');
var router = express.Router();
var BRService = require('../services/bible-retrieval');

var p = '';

// GET /
router.get('/', function (req, res, next) {
  return res.send('Set default template path!');
});

// GET route after registering
router.get('/getTodaysPassage', async function (req, res, next) {
  try {
    p = await BRService.getPassage('john+1');
  } catch (err) {
    return next(err);
  }
  return res.send(p);
}

);

module.exports = router;