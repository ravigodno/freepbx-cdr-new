import{validateToolInput}from'../tools/toolInputValidator.js';import{BusinessActionError}from'./actionErrors.js';
export function validateActionInput(schema:unknown,value:unknown){try{return validateToolInput(schema,value)}catch{throw new BusinessActionError('invalid_request',400,'Invalid business action input')}}
