import test from 'node:test';
import assert from 'node:assert/strict';
import { isStructuralBlockMove } from '../src/icons/icon_move_policy.js';

test('position-only dragging never requests icon DOM remeasurement',()=>{
  assert.equal(isStructuralBlockMove({
    blockId:'block',oldCoordinate:{x:10,y:20},newCoordinate:{x:100,y:120},
  }),false);
  assert.equal(isStructuralBlockMove({
    blockId:'block',oldParentId:null,newParentId:null,
    oldInputName:null,newInputName:null,
  }),false);
});

test('connect, disconnect, or change parent input requests targeted realignment',()=>{
  assert.equal(isStructuralBlockMove({
    oldParentId:null,newParentId:'parent',oldInputName:null,newInputName:'STACK',
  }),true);
  assert.equal(isStructuralBlockMove({
    oldParentId:'parent',newParentId:null,oldInputName:'STACK',newInputName:null,
  }),true);
  assert.equal(isStructuralBlockMove({
    oldParentId:'parent',newParentId:'parent',oldInputName:'A',newInputName:'B',
  }),true);
  assert.equal(isStructuralBlockMove({
    oldParentId:'old',newParentId:'new',
  }),true);
});
