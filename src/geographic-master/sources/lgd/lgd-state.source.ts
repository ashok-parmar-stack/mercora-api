import { Injectable } from '@nestjs/common';
import { MercoraLogger } from '../../../common/logger';
import { LgdClient } from './lgd-client';

export interface LgdStateRecord {
  lgdCode: string;
  name: string;
  localName?: string;
  code: string; // ISO standard code e.g. IN-GJ or IN-DL
  type: 'STATE' | 'UNION_TERRITORY';
  censusCode?: string;
}

const STATE_ISO_MAP: Record<string, string> = {
  '35': 'IN-AN',
  '28': 'IN-AP',
  '12': 'IN-AR',
  '18': 'IN-AS',
  '10': 'IN-BR',
  '4': 'IN-CH',
  '22': 'IN-CG',
  '7': 'IN-DL',
  '30': 'IN-GA',
  '24': 'IN-GJ',
  '6': 'IN-HR',
  '2': 'IN-HP',
  '1': 'IN-JK',
  '20': 'IN-JH',
  '29': 'IN-KA',
  '32': 'IN-KL',
  '37': 'IN-LA',
  '31': 'IN-LD',
  '23': 'IN-MP',
  '27': 'IN-MH',
  '14': 'IN-MN',
  '17': 'IN-ML',
  '15': 'IN-MZ',
  '13': 'IN-NL',
  '21': 'IN-OD',
  '34': 'IN-PY',
  '3': 'IN-PB',
  '8': 'IN-RJ',
  '11': 'IN-SK',
  '33': 'IN-TN',
  '36': 'IN-TG',
  '38': 'IN-DH',
  '16': 'IN-TR',
  '5': 'IN-UK',
  '9': 'IN-UP',
  '19': 'IN-WB',
};

const UNION_TERRITORIES_LGD = new Set(['35', '4', '38', '7', '1', '37', '31', '34']);

@Injectable()
export class LgdStateSource {
  private readonly logger = new MercoraLogger(LgdStateSource.name);

  /**
   * Fetch official States & UTs dynamically from Government LGD directory API using Axios
   * Source: https://lgdirectory.gov.in/
   */
  async fetchStates(): Promise<LgdStateRecord[]> {
    this.logger.log('Fetching official States & UTs dynamically from LGD Directory API via Axios...');

    try {
      const records = await LgdClient.executeDwrCall<any>('lgdDwrStateService', 'getAllStates', []);

      if (records && records.length > 0) {
        this.logger.log(`Retrieved ${records.length} official states/UTs dynamically from LGD API.`);

        return records
          .map((r: any) => {
            const rawLgd = String(r.stateCode || r.state_code || r.lgdCode || '');
            let rawName = (r.stateNameEnglish || r.state_name_english || r.stateName || r.name || '').trim();

            // Canonical naming cleanup if needed
            if (rawName.toLowerCase().startsWith('the dadra')) {
              rawName = 'Dadra and Nagar Haveli and Daman and Diu';
            }

            const rawCode = STATE_ISO_MAP[rawLgd] || (rawLgd ? `IN-${rawLgd}` : rawName.toUpperCase());
            const isUt = UNION_TERRITORIES_LGD.has(rawLgd) || r.stateOrUt === 'UT' || r.type === 'UNION_TERRITORY';

            return {
              lgdCode: rawLgd,
              name: rawName,
              localName: r.stateNameLocal || r.state_name_local || r.localName,
              code: rawCode,
              type: isUt ? ('UNION_TERRITORY' as const) : ('STATE' as const),
              censusCode: r.census2011Code ? String(r.census2011Code) : r.census_2011_code ? String(r.census_2011_code) : undefined,
            };
          })
          .filter((s: LgdStateRecord) => Boolean(s.name && s.lgdCode));
      }
    } catch (err: any) {
      this.logger.warn(`LGD State API call failed: ${err?.message}`);
    }

    this.logger.warn('LGD State API did not return valid data.');
    return [];
  }
}
