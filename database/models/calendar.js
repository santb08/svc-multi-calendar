const { model, Schema } = require("mongoose");

const EventSchema = new Schema({
  date: Date,
});

const calendarSchema = new Schema({
  email: String,
  rt: String,
  events: [EventSchema]
});

const calendarModel = model('calendar', calendarSchema);

module.exports = calendarModel;
