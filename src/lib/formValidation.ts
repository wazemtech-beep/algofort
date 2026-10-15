import { normalizeWebsite } from "./inputHelpers";
type Field = {name:string;label:string;type?:string;required?:boolean;options?:{value:string;disabled?:boolean}[]};
export function validateFields(fields:Field[],values:Record<string,unknown>) {
  const errors:Record<string,string>={};
  for(const field of fields) {
    const value=String(values[field.name]??'').trim();let error='';
    if(field.type==='file') {if(!values.cnicAttachmentId)error='Upload a CNIC attachment.';}
    else if(field.required&&!value)error=`${field.label} is required.`;
    else if(value) {
      if(field.options&&!field.options.some(option=>option.value===value&&!option.disabled))error=`Select a valid ${field.label.toLowerCase()}.`;
      else if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))error='Enter a valid email address.';
      else if(field.type==='number') {const plain=value.replaceAll(',','');if(!/^\d{1,12}(\.\d{1,2})?$/.test(plain)||Number(plain)<0||(field.name!=='platformFee'&&Number(plain)===0))error='Enter a positive amount with up to two decimal places.';}
      else if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))error='Choose a valid date.';
      else if(field.type==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))error='Choose a valid month.';
      else if(field.type==='url') {try{normalizeWebsite(value);}catch{error='Enter a valid website URL.';}}
      if(field.name==='newPassword'&&value.length<12)error='Use at least 12 characters.';
      if(field.name==='confirmPassword'&&value!==values.newPassword)error='Passwords do not match.';
      if(field.name==='cnic'&&!/^\d{13}$/.test(value.replaceAll('-','')))error='CNIC must contain 13 digits.';
      if(field.name==='port'&&(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535))error='Port must be between 1 and 65535.';
      if(field.name==='iban'&&!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value.replaceAll(' ','').toUpperCase()))error='Enter a valid IBAN format.';
    }
    if(error)errors[field.name]=error;
  }
  if(values.contractStart&&values.contractEnd&&String(values.contractEnd)<String(values.contractStart))errors.contractEnd='End date must be after the start date.';
  return errors;
}
