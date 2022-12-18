const { Router } = require('express');
const msal = require('@azure/msal-node');
const calendarModel = require('../database/models/calendar');
const { getCalendar } = require('../graph');
const { msalConfig } = require('../authConfig');
const router = Router();

const msalInstance = new msal.ConfidentialClientApplication(msalConfig);

const mapCalendar = (calendarData) => {
  console.log('[Mapping Data]', calendarData);

  return calendarData.map(data => ({
    name: data.subject,
    start: data.start,
    end: data.end,
  }));
}

router.get('/', async (_, res) => {
  try {
    const data = await calendarModel.find({});
    const tokens = data.map(item => item.rt);
    const calendars = [];

    console.log('[Tokens]', tokens);
    for (const token of tokens) {
      try {
        const { accessToken } = await msalInstance.acquireTokenByRefreshToken({
          scopes: ['Calendars.Read', 'User.Read'],
          refreshToken: token,
        });

        console.log('[Access Token]', accessToken);
        const calendar = await getCalendar(accessToken);
        calendars.push(...mapCalendar(calendar));
      } catch (error) {
        console.error(error);
        continue;
      }
    };

    res.status(200).send({
      calendars,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      error: error.message,
      calendars: [],
    });
  }
});


router.get('/list', async (req, res) => {
  const calendars = await calendarModel.find({}, { email: 1 });
  res.status(200).send(calendars);
});
module.exports = router;
