import type { SatelliteMapDto,SatelliteMapQuery, DashboardDto, DashboardQuery, CompanyCapabilitiesDto, CompanyDto, CreateCompanyInput, FarmDto, PlotDto, SamplingPointDto, MembershipDto,
  Page, ResourceResponse, UpdateCompanyInput, MembershipInput, MembershipPermissionsInput, SoilSampleDto, CreateSoilSampleInput,
  DeviceDto,ReadingDto,CreateDeviceInput,UpdateDeviceInput,ObservationDto } from '@base/saphi';
import { http } from '../../../services/http';

export type MasterKind = 'farms'|'plots'|'sampling-points';
export type MasterDto = FarmDto|PlotDto|SamplingPointDto;
const id=encodeURIComponent;
const company=(c:string)=>`/saphi/companies/${id(c)}`;
export const saphiApi={
  satelliteMap:(c:string,query:SatelliteMapQuery,signal:AbortSignal)=>http.get<ResourceResponse<SatelliteMapDto>>(`${company(c)}/satellite/map`,{query,signal}),
  dashboard:(c:string,query:DashboardQuery)=>http.get<ResourceResponse<DashboardDto>>(`${company(c)}/dashboard`,{query}),
  observations:(c:string,query:Record<string,string|number|undefined>)=>http.get<Page<ObservationDto>>(`${company(c)}/satellite/observations`,{query}),
  observation:(c:string,o:string)=>http.get<ResourceResponse<ObservationDto>>(`${company(c)}/satellite/observations/${id(o)}`),
  devices:(c:string,query:Record<string,string|number|undefined>={})=>http.get<Page<DeviceDto>>(`${company(c)}/devices`,{query}),
  device:(c:string,d:string)=>http.get<ResourceResponse<DeviceDto>>(`${company(c)}/devices/${id(d)}`),
  createDevice:(c:string,input:CreateDeviceInput)=>http.post<ResourceResponse<DeviceDto>>(`${company(c)}/devices`,input),
  updateDevice:(c:string,d:string,input:UpdateDeviceInput)=>http.patch<ResourceResponse<DeviceDto>>(`${company(c)}/devices/${id(d)}`,input),
  readings:(c:string,query:Record<string,string|number|undefined>)=>http.get<Page<ReadingDto>>(`${company(c)}/telemetry/readings`,{query}),
  latest:(c:string,query:Record<string,string|number|undefined>)=>http.get<ResourceResponse<ReadingDto[]>>(`${company(c)}/telemetry/latest`,{query}),
  samples:(c:string,query:Record<string,string|number|undefined>={})=>http.get<Page<SoilSampleDto>>(`${company(c)}/samples`,{query}),
  sample:(c:string,s:string)=>http.get<ResourceResponse<SoilSampleDto>>(`${company(c)}/samples/${id(s)}`),
  createSample:(c:string,input:CreateSoilSampleInput)=>http.post<ResourceResponse<SoilSampleDto>>(`${company(c)}/samples`,input),
  companies:(query:Record<string,string|number|undefined>={})=>http.get<Page<CompanyDto>>('/saphi/companies',{query}),
  company:(c:string)=>http.get<ResourceResponse<CompanyDto>>(company(c)),
  createCompany:(input:CreateCompanyInput)=>http.post<ResourceResponse<CompanyDto>>('/saphi/companies',input),
  updateCompany:(c:string,input:UpdateCompanyInput)=>http.patch<ResourceResponse<CompanyDto>>(company(c),input),
  capabilities:(c:string)=>http.get<ResourceResponse<CompanyCapabilitiesDto>>(`${company(c)}/capabilities`),
  list:(c:string,kind:MasterKind,query:Record<string,string|number|undefined>={})=>http.get<Page<MasterDto>>(`${company(c)}/${kind}`,{query}),
  create:(c:string,kind:MasterKind,input:unknown)=>http.post<ResourceResponse<MasterDto>>(`${company(c)}/${kind}`,input),
  update:(c:string,kind:MasterKind,resourceId:string,input:unknown)=>http.patch<ResourceResponse<MasterDto>>(`${company(c)}/${kind}/${id(resourceId)}`,input),
  members:(c:string,query:Record<string,string|number|undefined>={})=>http.get<Page<MembershipDto>>(`${company(c)}/memberships`,{query}),
  setMember:(c:string,userId:string,input:MembershipInput)=>http.put(`${company(c)}/memberships/${id(userId)}`,input),
  setPermissions:(c:string,userId:string,input:MembershipPermissionsInput)=>http.put(`${company(c)}/memberships/${id(userId)}/permissions`,input),
};
