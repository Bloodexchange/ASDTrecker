import test from 'node:test';import assert from 'node:assert/strict';
import {percentage} from '../web/core.js';
test('percent movement handles gains, losses, missing/zero baseline and CBU absolute difference',()=>{assert.equal(percentage(105,100),5);assert.equal(percentage(95,100),-5);assert.equal(percentage(12000,12000),0);assert.equal(percentage(10,0),null);assert.equal(percentage(10,null),null);assert.equal(percentage(NaN,10),null);const current=12000,difference=-60;assert.ok(Math.abs(percentage(current,current-difference)-(-.4975124378))<.00001);});
