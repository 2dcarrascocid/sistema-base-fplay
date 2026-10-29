/** Values for native datetime-local controls, interpreted in the browser's time zone. */
export function localDateTime(date:Date){
  const pad=(value:number)=>String(value).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The API accepts UTC ISO instants. Invalid input is returned for schema validation. */
export function utcInstant(value:string){
  const date=new Date(value);
  return value&&Number.isFinite(date.getTime())?date.toISOString():value;
}
