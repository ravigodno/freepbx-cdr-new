import assert from 'node:assert/strict';
import { parseMtsBusinessUsagePayload, parseMtsValidityPackages } from '../server/balance/providers/mtsBusiness.js';
import { matchMtsPackageCounter } from '../server/balance/mtsPackagesService.js';

const payload = {
  Usages: [{
    date: '2026-07-29T10:00:00+03:00',
    type: 'network',
    amount: 0,
    Characteristics: {
      direction: 'O',
      unitOfMeasureCode: 'SECOND',
      factUnitsCode: 'SECOND',
      numberOfUnits: 60,
      factUnits: 34,
      ServiceCounters: [
        { id: '66_PBXPACK', value: 27600, validFor: '2026-07-29T05:04:05Z' },
        { id: '66_PBXPACK', value: 27540 }
      ]
    }
  }]
};

const [event] = parseMtsBusinessUsagePayload(payload, JSON.stringify(payload));
assert.equal(event.packageCounterId, '66_PBXPACK');
assert.equal(event.packageCounterBefore, 27600);
assert.equal(event.packageCounterAfter, 27540);
assert.equal(event.packageCounterUsed, 60);
assert.equal(matchMtsPackageCounter('PBX пакет 5000', ['66_AVSPM1000', '66_PBXPACK']), '66_PBXPACK');
assert.equal(matchMtsPackageCounter('а.втосекретарь. Пакет минут 1000', ['66_AVSPM1000', '66_PBXPACK']), '66_AVSPM1000');
assert.equal(matchMtsPackageCounter('Неизвестный пакет 3000', ['counter-a', 'counter-b']), null);

const validity = parseMtsValidityPackages([{
  name: 'ForisCounters',
  customerAccount: [{
    productRelationship: [{
      product: {
        name: 'PBX пакет 1000',
        externalID: 'PE1433',
        productStatus: 'Active',
        productPrice: [{ unitOfMeasure: 'SECOND' }],
        validFor: { startDateTime: '2026-07-21T06:31:55Z', endDateTime: '2026-07-31T20:59:59Z' },
        productSpecification: {
          name: 'PBX пакет',
          id: 'PBXPACK',
          productSpecCharacteristic: [{
            prodSpecCharacteristicValue: [{ valueType: 'CurrentValue', value: '59820' }]
          }]
        }
      }
    }]
  }]
}], '79180274777');
assert.equal(validity.length, 1);
assert.equal(validity[0].serviceName, 'PBX пакет 1000');
assert.equal(validity[0].counterId, 'PBXPACK');
assert.equal(validity[0].currentValue, 59820);
assert.equal(validity[0].unit, 'SECOND');

console.log('MTS package normalization tests passed');
