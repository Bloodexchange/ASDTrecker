import test from 'node:test';import assert from 'node:assert/strict';
import {parseMoneyInput,convertMoneyInput} from '../web/money-input.js';
const rates={USD:1,UZS:12000,CNY:7.2,EUR:.9,JPY:150,KWD:.3};
test('UZS typed into CNY field converts and preserves original input',()=>{
 for(const value of ['100000 сум','100 000 UZS','UZS 100000',"100000 so'm"]){const r=convertMoneyInput(value,'CNY','CNY',rates);assert.equal(r.minor,6000);assert.equal(r.value,60);assert.equal(r.inputCurrency,'UZS');assert.equal(r.inputMinor,10000000);}
 assert.equal(convertMoneyInput('100000','UZS','CNY',rates).minor,6000);
 assert.equal(convertMoneyInput('100000','CNY','CNY',rates).minor,10000000);
});
test('currency suffix, sign, decimal precision and ambiguous yen symbol are explicit',()=>{
 assert.equal(convertMoneyInput('10,50 USD','EUR','CNY',rates).minor,7560);
 assert.equal(convertMoneyInput('10 юаней','UZS','UZS',rates).minor,1666667);
 assert.equal(convertMoneyInput('-100000 UZS','CNY','CNY',rates,{allowNegative:true}).minor,-6000);
 assert.equal(convertMoneyInput('0','CNY','CNY',{}, {allowZero:true}).minor,0);
 assert.throws(()=>parseMoneyInput('10 ¥','CNY'),/CNY/);
 assert.throws(()=>parseMoneyInput('10 XYZ','CNY'),/Неизвестная/);
 assert.throws(()=>parseMoneyInput('12abc34','CNY'));
 assert.throws(()=>parseMoneyInput('10.123 CNY','CNY'),/максимум/);
 assert.throws(()=>convertMoneyInput('100000 UZS','CNY','CNY',{USD:1}),/Нет курса/);
 assert.throws(()=>convertMoneyInput('0.01 UZS','CNY','CNY',rates),/округления/);
});
