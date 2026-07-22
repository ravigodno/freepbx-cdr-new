import{validateToolInput}from'../tools/toolInputValidator.js';import{BusinessActionError}from'./actionErrors.js';
export function validateActionOutput(schema:unknown,value:unknown){try{return validateToolInput(schema,value)}catch{throw new BusinessActionError('internal_error',500,'Invalid business action output')}}
