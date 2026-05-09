from __future__ import annotations

from io import StringIO

import ezdxf

from app.models.schema import LayoutSchema


class DxfExporter:
    def export(self, schema: LayoutSchema) -> bytes:
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()
        if 'WALLS' not in doc.layers:
            doc.layers.new('WALLS')
        if 'ROOM_BOUNDARIES' not in doc.layers:
            doc.layers.new('ROOM_BOUNDARIES')

        for wall in schema.walls:
            msp.add_line((wall.start[0], wall.start[1]), (wall.end[0], wall.end[1]), dxfattribs={'layer': 'WALLS'})

        for room in schema.rooms:
            if len(room.polygon) < 3:
                continue
            pts = [(p[0], p[1]) for p in room.polygon]
            msp.add_lwpolyline(pts + [pts[0]], dxfattribs={'layer': 'ROOM_BOUNDARIES'})

        stream = StringIO()
        doc.write(stream)
        return stream.getvalue().encode('utf-8')
