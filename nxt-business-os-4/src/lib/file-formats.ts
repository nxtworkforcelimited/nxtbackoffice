export const maxFileBytes=50*1024*1024;
export const fileAccept='.pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.xls,.xlsx,.docx,.pptx,.mp4,.webm';
const formats:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',txt:'text/plain',csv:'text/csv',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',mp4:'video/mp4',webm:'video/webm'};
export function fileMime(name:string){return formats[name.split('.').pop()?.toLowerCase()??'']??null;}
