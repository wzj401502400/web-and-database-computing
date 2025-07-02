var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/trivia', async (req, res) => {
  const {
 amount = 5, difficulty = '', category = '', type = ''
  } = req.query; let url = `https://opentdb.com/api.php?amount=${amount}&encode=base64`;
  if (difficulty) url += `&difficulty=${difficulty}`;
  if (category) url += `&category=${category}`;
  if (type) url += `&type=${type}`;
  try {
 const response = await fetch(url);
    const data = await response.json();
    res.json(data);
} catch (err) { res.status(500).json({ error: 'Failed to fetch trivia questions', details: err.message }); }
});

module.exports = router;
