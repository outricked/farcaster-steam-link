import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = 'steamSession'; // Define cookie name

export async function GET(_request: NextRequest) {
    const cookieStore = await cookies();
    const steamSession = cookieStore.get(COOKIE_NAME);
    if (!steamSession) {
        return NextResponse.json({ error: 'No session found' }, { status: 401 });
    }
    return NextResponse.json({ session: steamSession });
}