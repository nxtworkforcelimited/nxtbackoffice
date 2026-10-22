// Older open forms can still send a hidden purchase-order placeholder.
// Expenses and subscriptions never use purchase-order line items.
export function normalizeFinanceInput(value:unknown):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const input=value as Record<string,unknown>;
 if(input.action==='save'&&(input.kind==='expense'||input.kind==='subscription'))return {...input,order_lines:[]};
 return value;
}
