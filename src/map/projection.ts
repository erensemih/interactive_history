import type { Map as MLMap } from 'maplibre-gl';
import { unwrapNear } from '../domain/antimeridian';

/**
 * Where the overlays of the map (markers, names, the pin, the AI's marks and arrows) put a place on the screen. The map is
 * one world; where it shows the Pacific across the date line (`MapView`'s wide view) there is a copy of the world on either
 * side of it and a place at −158° lies at 202° there. In the wide view every overlay asks for the copy nearest to what the map
 * looks at, so a marker on the far side of the date line is where the eye finds it, and what is nowhere near is off the screen
 * as ever. In the plain view there is one world and a place is where its longitude says.
 */
export class Projector {
  constructor(
    private readonly map: MLMap,
    /** Does the map show copies of the world (the wide view)? */
    private readonly wide: () => boolean = () => false,
  ) {}

  /** The screen position of a place, in the copy of the world nearest the centre of the view. */
  near(lon: number, lat: number): { x: number; y: number } {
    return this.map.project([this.wide() ? unwrapNear(lon, this.map.getCenter().lng) : lon, lat]);
  }

  /** The screen position of a point whose longitude already runs on (a route over the date line): exactly where it says. */
  exact(lon: number, lat: number): { x: number; y: number } {
    return this.map.project([lon, lat]);
  }

  /** Pixels the world is wide at the zoom of the view: how far the copy of a drawing on the other side of the date line lies. */
  worldWidth(): number {
    return 512 * 2 ** this.map.getZoom();
  }
}
