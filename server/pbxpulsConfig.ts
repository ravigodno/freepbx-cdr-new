import dotenv from 'dotenv';
import path from 'path';
// Shared by the server and every maintenance CLI. Explicit process variables win.
dotenv.config({path: process.env.PBXPULS_ENV_FILE || path.join(process.cwd(), '.env'), quiet:true});
