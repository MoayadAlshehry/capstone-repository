import { publicPeople } from '../../../public-adoption/discovery-server';
import { parsePeopleQuery } from '../../../public-adoption/discovery-query';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
  const params=new URL(request.url).searchParams;
  try{parsePeopleQuery(params);}catch{return Response.json({code:'INVALID_LOOKUP'},{status:400,headers});}
  try{return Response.json({items:await publicPeople(params)},{headers});}
  catch{return Response.json({code:'LOOKUP_UNAVAILABLE'},{status:503,headers});}
}
