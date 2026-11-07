// A session a route sets for the code it calls in-process, read first by auth().
//
// One user: app/api/media/direct, which verifies a signed upload address and
// then runs the ordinary media upload (app/api/media POST) as that address's
// token. The upload route reads who is calling with auth(), and a request made
// with curl carries no header that says so — this does, for that call only
// (AsyncLocalStorage: nothing outside the run() ever sees it).

import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "next-auth";

export const sessionOverride = new AsyncLocalStorage<Session>();
