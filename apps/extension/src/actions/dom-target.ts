export interface DomTargetIdentity {
  id:string;
  role:string;
  label?:string;
  tagName?:string;
  inputType?:string;
  enabled:boolean;
  visible:boolean;
  source?:string;
}

export function rebindFreshDomTarget(previous:DomTargetIdentity,fresh:DomTargetIdentity[]):string{
  const matches=fresh.filter(candidate=>candidate.enabled&&candidate.visible&&
    candidate.role===previous.role&&candidate.label===previous.label&&
    candidate.tagName===previous.tagName&&candidate.inputType===previous.inputType);
  if(matches.length!==1)throw new Error("STALE_ELEMENT");
  return matches[0]!.id;
}
