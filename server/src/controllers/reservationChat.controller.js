const asyncHandler = require('../utils/asyncHandler');
const chat = require('../services/chat/reservationChat');

exports.list = asyncHandler(async (req, res) => {
  res.json(await chat.listMessages(req.user._id, req.params.id, req.query.before));
});

exports.send = asyncHandler(async (req, res) => {
  const message = await chat.sendMessage(req.user._id, req.params.id, req.body?.text);
  res.status(201).json({ message });
});
