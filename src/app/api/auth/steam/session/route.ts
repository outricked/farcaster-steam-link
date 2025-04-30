import { cookies } from 'next/headers'; // Import cookies
import { NextRequest, NextResponse } from 'next/server';
import { URLSearchParams } from 'url'; // Keep Node.js URLSearchParams for building the verification request

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const COOKIE_NAME = 'steamSession'; // Define cookie name
const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'; // Get base URL for redirect

// Handle GET request from Steam callback
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const searchParams = request.nextUrl.searchParams;
  console.log('Received GET request with params:', searchParams.toString());

  // Check if it's a valid OpenID callback
  if (searchParams.get('openid.mode') !== 'id_res') {
    console.log('Not an OpenID callback (id_res). Redirecting home.');
    // Redirect home if it's not the expected callback mode
    return NextResponse.redirect(baseUrl + '/?error=InvalidCallbackMode');
  }

  try {
    // --- Step 1: Verify the OpenID response with Steam ---
    const verificationParams = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0', // Make sure NS is included
      'openid.mode': 'check_authentication',
    });

    // Append all parameters received from Steam to the verification request
    // Steam expects all params prefixed with 'openid.'
    searchParams.forEach((value, key) => {
      if (key.startsWith('openid.')) {
        verificationParams.append(key, value);
      }
    });

    // Replace checkid_setup mode from original request with check_authentication for verification
    verificationParams.set('openid.mode', 'check_authentication');

    console.log('Sending verification request to Steam:', verificationParams.toString());

    const steamVerificationResponse = await fetch(STEAM_OPENID_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: verificationParams.toString(),
      cache: 'no-store', // Ensure fresh verification
    });

    const verificationText = await steamVerificationResponse.text();
    console.log('Steam verification response text:', verificationText);

    // --- Step 2: Check verification result ---
    if (!verificationText.includes('is_valid:true')) {
      console.error('Steam OpenID verification failed:', verificationText);
      // Redirect to home with an error query param
      const redirectUrl = new URL(baseUrl);
      redirectUrl.searchParams.set('error', 'SteamVerificationFailed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    // --- Step 3: Extract SteamID ---
    const claimedId = searchParams.get('openid.claimed_id');
    const steamIdMatch = claimedId?.match(
      /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/
    );

    if (!steamIdMatch || !steamIdMatch[1]) {
      console.error('Could not extract SteamID from claimed_id:', claimedId);
      const redirectUrl = new URL(baseUrl);
      redirectUrl.searchParams.set('error', 'SteamIdExtractionFailed');
      return NextResponse.redirect(redirectUrl.toString());
    }

    const steamId64 = steamIdMatch[1];
    console.log('SteamID extracted:', steamId64);

    // --- Step 4: Set session cookie ---
    // You might want to encrypt or sign this cookie in a real application
    const store = await cookieStore; // Await the promise
    store.set(COOKIE_NAME, steamId64, {
      httpOnly: true, // Important for security
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      path: '/', // Cookie available site-wide
      maxAge: 60 * 60 * 24 * 7, // Example: 1 week expiry
      sameSite: 'lax', // Helps prevent CSRF
    });
    console.log('Session cookie set for SteamID:', steamId64);

    // --- Step 5: Redirect to the home page (or dashboard) ---
    // Redirect without any query parameters on success
    return NextResponse.redirect(baseUrl);

  } catch (error) {
    console.error('Error in Steam callback handler:', error);
    // Redirect to home with a generic error query param
    const redirectUrl = new URL(baseUrl);
    redirectUrl.searchParams.set('error', 'InternalServerError');
    return NextResponse.redirect(redirectUrl.toString());
  }
}

// Remove the old POST handler and the placeholder GET handler 