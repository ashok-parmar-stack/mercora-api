import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { MercoraLogger } from '../../../common/logger';
import { EXTERNAL_APIS } from '../../../config/external-apis.config';

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // Handle Government portal SSL cert chains
});

export class LgdClient {
  private static readonly logger = new MercoraLogger('LgdClient');
  private static sessionInstance: AxiosInstance | null = null;
  private static sessionCookie: string = '';
  private static lastSessionTime = 0;

  /**
   * Get or create active session with LGD Directory portal
   */
  private static async getSession(): Promise<{ client: AxiosInstance; cookie: string }> {
    const now = Date.now();
    // Cache session for up to 10 minutes
    if (this.sessionInstance && this.sessionCookie && now - this.lastSessionTime < 600000) {
      return { client: this.sessionInstance, cookie: this.sessionCookie };
    }

    const baseUrl = EXTERNAL_APIS.LGD.BASE_URL.replace(/\/+$/, '');
    const client = axios.create({
      baseURL: baseUrl,
      httpsAgent,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
    });

    try {
      const pageRes = await client.get('/downloadDirectory.do', {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const setCookie = pageRes.headers['set-cookie'] || [];
      const cookieHeader = setCookie.map((c: string) => c.split(';')[0]).join('; ');

      this.sessionInstance = client;
      this.sessionCookie = cookieHeader;
      this.lastSessionTime = now;

      return { client, cookie: cookieHeader };
    } catch (err: any) {
      this.logger.warn(`Failed to initialize session from LGD homepage: ${err?.message}. Proceeding without pre-set cookie.`);
      this.sessionInstance = client;
      this.sessionCookie = '';
      this.lastSessionTime = now;
      return { client, cookie: '' };
    }
  }

  /**
   * Safe parser for DWR JavaScript response payload
   */
  public static parseDwrResponse<T = any>(responseText: string): T[] {
    if (!responseText || typeof responseText !== 'string') return [];

    const callbackMatch = responseText.match(/handleCallback\(\s*["'][^"']*["']\s*,\s*["'][^"']*["']\s*,\s*(\[[\s\S]*?\])\s*\);/);
    if (!callbackMatch) return [];

    const rawJs = callbackMatch[1];

    try {
      // 1. Replace new Date(timestamp) with timestamp
      const cleanDates = rawJs.replace(/new Date\((\d+)\)/g, '$1');

      // 2. Wrap unquoted property names with quotes
      const validJsonStr = cleanDates
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/,\s*([}\]])/g, '$1');

      return JSON.parse(validJsonStr);
    } catch {
      // Robust regex fallback parsing if JSON.parse encounters non-standard tokens
      const items: any[] = [];
      const itemRegex = /\{([^}]+)\}/g;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(rawJs)) !== null) {
        const fieldStr = itemMatch[1];
        const obj: Record<string, any> = {};
        const fieldRegex = /([a-zA-Z0-9_]+)\s*:\s*("([^"\\]*(\\.[^"\\]*)*)"|'([^'\\]*(\\.[^'\\]*)*)'|null|true|false|\d+|new Date\(\d+\))/g;
        let fMatch;

        while ((fMatch = fieldRegex.exec(fieldStr)) !== null) {
          const key = fMatch[1];
          let val: any = fMatch[2];

          if (val === 'null') val = null;
          else if (val === 'true') val = true;
          else if (val === 'false') val = false;
          else if (val.startsWith('"') || val.startsWith("'")) val = val.slice(1, -1).trim();
          else if (/^\d+$/.test(val)) val = Number(val);

          obj[key] = val;
        }

        if (Object.keys(obj).length > 0) {
          items.push(obj);
        }
      }

      return items as T[];
    }
  }

  /**
   * Reset session on errors
   */
  public static resetSession(): void {
    this.sessionInstance = null;
    this.sessionCookie = '';
    this.lastSessionTime = 0;
  }

  /**
   * Execute a DWR RPC Call to LGD Directory Backend with auto-retry
   */
  public static async executeDwrCall<T = any>(
    serviceName: string,
    methodName: string,
    params: Array<string | number> = [],
    maxRetries = 3,
  ): Promise<T[]> {
    const paramLines = params.map((p, idx) => {
      const type = typeof p === 'number' ? 'number' : 'string';
      return `c0-param${idx}=${type}:${p}`;
    });

    const dwrBody = [
      'callCount=1',
      'page=%2FdownloadDirectory.do',
      'httpSessionId=',
      'scriptSessionId=12345678/12345678',
      `c0-scriptName=${serviceName}`,
      `c0-methodName=${methodName}`,
      'c0-id=0',
      ...paramLines,
      'batchId=0',
      'instanceId=0',
    ].join('\n') + '\n';

    const endpoint = `/dwr/call/plaincall/${serviceName}.${methodName}.dwr`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { client, cookie } = await this.getSession();

        const res = await client.post(endpoint, dwrBody, {
          headers: {
            'Content-Type': 'text/plain',
            Cookie: cookie,
            Referer: 'https://lgdirectory.gov.in/downloadDirectory.do',
            Origin: 'https://lgdirectory.gov.in',
          },
        });

        if (res.status === 200 && res.data) {
          const parsed = this.parseDwrResponse<T>(res.data);
          if (parsed && parsed.length > 0) {
            return parsed;
          }
          // If response body was received but parsed empty when calling getDistrictList or getAllStates, retry after short delay
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 300));
            continue;
          }
          return parsed;
        }
      } catch (err: any) {
        this.logger.warn(`LGD DWR call ${serviceName}.${methodName} attempt ${attempt}/${maxRetries} failed: ${err?.message}`);
        this.resetSession();
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    return [];
  }
}
