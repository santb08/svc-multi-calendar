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
      // ...req.session.authCodeUrlRequest,
      scopes: ["user.read","offline_access"],
      redirectUri: REDIRECT_URI,
      prompt: 'consent'
    });

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
      redirectTo: process.env.SUCCESS_URI,
    })
  );

  const authCodeUrlRequestParams = {
    state: state,

    /**
     * By default, MSAL Node will add OIDC scopes to the auth code url request. For more information, visit:
     * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
     */
    scopes: ['openid', 'offline_access'],
  };

  const authCodeRequestParams = {
    /**
     * By default, MSAL Node will add OIDC scopes to the auth code request. For more information, visit:
     * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
     */
    scopes: ['openid', 'offline_access'],
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
    scopes: ['openid', 'offline_access'],
  };

  const authCodeRequestParams = {
    scopes: ['openid', 'offline_access'],
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

router.get("/redirect", async function (req, res, next) {
  try {
    const tokenRequest = {
      code: req.query.code,
      scopes: ["user.read","offline_access"],
      redirectUri: REDIRECT_URI,
      accessType: 'offline',
    };

    const tokenResponse = await msalInstance.acquireTokenByCode(tokenRequest);

    // const accessToken = tokenResponse.accessToken;
    const accountId = tokenResponse.account.homeAccountId;
    const refreshToken = () => {
      const tokenCache = msalInstance.getTokenCache().serialize();
      const refreshTokenObject = JSON.parse(tokenCache).RefreshToken
      const accountKey = Object.keys(refreshTokenObject).find((key) => refreshTokenObject[key].home_account_id === accountId);
      const refreshToken = refreshTokenObject[accountKey].secret;
      console.log(refreshTokenObject[accountKey]);
      return refreshToken;
    }

    const rt = refreshToken();
    const email = tokenResponse.account.username;

    const alreadyExists = await calendarModel.find({ email });

    if (!alreadyExists?.length) {
      const newCalendar = await calendarModel.create({
        email,
        rt,
      });

      await newCalendar.save();
    }

    res.redirect('https://multi-calendar-tortutales.vercel.app/');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
