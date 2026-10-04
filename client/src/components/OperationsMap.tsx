import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import type { Incident, Resource } from '../types';

export function OperationsMap({ incidents, resources }: { incidents: Incident[]; resources: Resource[] }) {
  const points = [...incidents, ...resources];
  const center: [number, number] = points.length ? [points[0].lat, points[0].lng] : [12.87, 74.85];

  return <div className="map-frame">
    <MapContainer center={center} zoom={11} scrollWheelZoom className="operations-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {incidents.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).map((incident) => (
        <CircleMarker key={incident.id} center={[incident.lat, incident.lng]} radius={incident.severity === 'CRITICAL' ? 10 : incident.severity === 'HIGH' ? 8 : 6} pathOptions={{ color: incident.severity === 'CRITICAL' || incident.severity === 'HIGH' ? '#c84b36' : '#d78b37', fillColor: incident.severity === 'CRITICAL' || incident.severity === 'HIGH' ? '#c84b36' : '#d78b37', fillOpacity: 0.88 }}>
          <Popup><strong>{incident.code} · {incident.severity}</strong><br />{incident.name}<br />{incident.location_name}</Popup>
        </CircleMarker>
      ))}
      {resources.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)).map((resource) => (
        <CircleMarker key={resource.id} center={[resource.lat, resource.lng]} radius={5} pathOptions={{ color: '#176c65', fillColor: '#2b9b86', fillOpacity: 0.95 }}>
          <Popup><strong>{resource.code} · {resource.name}</strong><br />{resource.status} · {resource.available_quantity} available</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
    <div className="map-legend"><span><i className="legend-incident" />Incidents</span><span><i className="legend-resource" />Resources</span></div>
  </div>;
}