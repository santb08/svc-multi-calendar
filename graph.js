globalThis.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { Client } = require('@microsoft/microsoft-graph-client');
const moment = require('moment');

const getAuthenticatedClient = (accessToken) => {
  // Initialize Graph client
  const client = Client.init({
    // Implement an auth provider that gets a token
    // from the app's MSAL instance
    authProvider: async (done) => {
      done(null, accessToken);
    }
  });

  return client;
};

const getCalendar = async (accessToken) => {
  try {
    const client = getAuthenticatedClient(accessToken);
    const startOfMonth = moment().startOf('month').format('YYYY-MM-DD hh:mm');
    const endOfMonth   = moment().endOf('month').format('YYYY-MM-DD hh:mm');

    const a = await client.api('/me').get();
    console.log('[Fetching Calendars For]', accessToken, a);

    const { value: events } = await client
      .api('/me/calendarview')
      // Add Prefer header to get back times in user's timezone
      // .header("Prefer", `outlook.timezone="${timeZone}"`)
      // Add the begin and end of the calendar window
      .query({ startDateTime: startOfMonth, endDateTime: endOfMonth })
      // Get just the properties used by the app
      .select('subject,organizer,start,end')
      // Order by start time
      .orderby('start/dateTime')
      // Get at most 50 results
      .top(50)
      .get();

    return events;
  } catch (error) {
    console.error(error);
    return []
  }
};

module.exports = {
  getCalendar
};