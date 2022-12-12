/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const express = require("express");
const msal = require("@azure/msal-node");

const {
  msalConfig,
  REDIRECT_URI,
  // POST_LOGOUT_REDIRECT_URI,
} = require("../authConfig");
const calendarModel = require("../database/models/calendar");

const router = express.Router();
const msalInstance = new msal.ConfidentialClientApplication(msalConfig);
const cryptoProvider = new msal.CryptoProvider();
const scopes = ['Calendars.Read', 'User.Read'];

/**
 * Prepares the auth code request parameters and initiates the first leg of auth code flow
 * @param req: Express request object
 * @param res: Express response object
 * @param next: Express next function
 * @param authCodeUrlRequestParams: parameters for requesting an auth code url
 * @param authCodeRequestParams: parameters for requesting tokens using auth code
 */
async function redirectToAuthCodeUrl(
  req,
  res,
  next,
  authCodeUrlRequestParams,
  authCodeRequestParams
) {
  // Generate PKCE Codes before starting the authorization flow
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();

  // Set generated PKCE codes and method as session consts
  req.session.pkceCodes = {
    challengeMethod: "S256",
    verifier: verifier,
    challenge: challenge,
  };

  /**
   * By manipulating the request objects below before each request, we can obtain
   * auth artifacts with desired claims. For more information, visit:
   * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationurlrequest
   * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationcoderequest
   **/

  req.session.authCodeUrlRequest = {
    redirectUri: REDIRECT_URI,
    responseMode: "form_post", // recommended for confidential clients
    codeChallenge: req.session.pkceCodes.challenge,
    codeChallengeMethod: req.session.pkceCodes.challengeMethod,
    ...authCodeUrlRequestParams,
  };

  req.session.authCodeRequest = {
    redirectUri: REDIRECT_URI,
    code: "",
    ...authCodeRequestParams,
  };

  // Get url to sign user in and consent to scopes needed for application
  try {
    const authCodeUrlResponse = await msalInstance.getAuthCodeUrl({
      ...req.session.authCodeUrlRequest,
      forceRefresh: true,
    });

    console.log(authCodeUrlResponse);
    res.redirect(authCodeUrlResponse);
  } catch (error) {
    next(error);
  }
}

router.get("/signin", async function (req, res, next) {
  // create a GUID for crsf
  req.session.csrfToken = cryptoProvider.createNewGuid();

  /**
   * The MSAL Node library allows you to pass your custom state as state parameter in the Request object.
   * The state parameter can also be used to encode information of the app's state before redirect.
   * You can pass the user's state in the app, such as the page or view they were on, as input to this parameter.
   */
  const state = cryptoProvider.base64Encode(
    JSON.stringify({
      csrfToken: req.session.csrfToken,
      redirectTo: "/",
    })
  );

  const authCodeUrlRequestParams = {
    state: state,

    /**
     * By default, MSAL Node will add OIDC scopes to the auth code url request. For more information, visit:
     * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
     */
    scopes,
  };

  const authCodeRequestParams = {
    /**
     * By default, MSAL Node will add OIDC scopes to the auth code request. For more information, visit:
     * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
     */
    scopes,
  };

  // trigger the first leg of auth code flow
  return redirectToAuthCodeUrl(
    req,
    res,
    next,
    authCodeUrlRequestParams,
    authCodeRequestParams
  );
});

router.get("/acquireToken", async function (req, res, next) {
  // create a GUID for csrf
  req.session.csrfToken = cryptoProvider.createNewGuid();

  // encode the state param
  const state = cryptoProvider.base64Encode(
    JSON.stringify({
      csrfToken: req.session.csrfToken,
      redirectTo: "/users/profile",
    })
  );

  const authCodeUrlRequestParams = {
    state: state,
    scopes,
  };

  const authCodeRequestParams = {
    scopes,
  };

  // trigger the first leg of auth code flow
  return redirectToAuthCodeUrl(
    req,
    res,
    next,
    authCodeUrlRequestParams,
    authCodeRequestParams
  );
});

router.post("/redirect", async function (req, res, next) {
  if (req.body.state) {
    const state = JSON.parse(cryptoProvider.base64Decode(req.body.state));

    // check if csrfToken matches
    if (state.csrfToken === req.session.csrfToken) {
      req.session.authCodeRequest.code = req.body.code; // authZ code
      req.session.authCodeRequest.codeVerifier = req.session.pkceCodes.verifier; // PKCE Code Verifier

      try {
        const tokenResponse1 = await msalInstance.acquireTokenByCode({
          ...req.session.authCodeRequest,
          forceRefresh: true,
        });

        const refreshToken = () => {
          const tokenCache = msalInstance.getTokenCache().serialize();
          const refreshTokenObject = JSON.parse(tokenCache).RefreshToken
          const refreshToken = refreshTokenObject[Object.keys(refreshTokenObject)[0]].secret;
          return refreshToken;
        }

        const rt = refreshToken();
        const email = tokenResponse1.account.username;

        const alreadyExists = await calendarModel.find({ email });

        console.log(alreadyExists);
        if (!alreadyExists?.length) {
          const newCalendar = await calendarModel.create({
            email,
            rt,
          });

          await newCalendar.save();
        }

        res.redirect(state.redirectTo);
      } catch (error) {
        next(error);
      }
    } else {
      next(new Error("csrf token does not match"));
    }
  } else {
    next(new Error("state is missing"));
  }
});

router.get('/refresh', async (req, res) => {
  // const { accessToken } = req.params;
  console.log('xd');

  const token = await msalInstance.acquireTokenByRefreshToken({
    scopes,
    refreshToken: 'M.R3_BAY.-CSLVwq9qG2SDg1V1VsyDLzjplojQgSmUDKItiCajliUlEf4Y7htpB96azJJBmrxHDIXSJIiK0uEnUdf6ODLr7oEN*frYTJdR6PyCKD8Hy3hxtXNKl7B9pRh6P*LLCrqKjmICwAC6s9s1mcnlWwgPKCNZSN9dj5eIZe0ohtBZHxkPkztvGUlt1hvx37NesVD6Sx4PMuREgOUWynPxXV*!fEvNMMZ66y4!Fi4BRxHwqPD6Z6Lk*ZDzPLjGkVKQa19n!cdI5kNRzc6vCysgZXL9fV5yV7K7IzHRFtW91PHlWjPYtIAKlQUdtE6vlpI4OO3LZw$$',
  });

  console.log(token);
  res.send(token);
})

module.exports = router;
