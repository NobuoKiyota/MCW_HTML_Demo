bl_info = {
    "name": "Fighter Part Generator",
    "author": "fighter-generator pipeline",
    "version": (0, 11, 0),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar > FighterGen",
    "description": "Parametric hard-surface fighter part batch generator with robust socket routing and detailed weapon chambers",
    "category": "Object",
}

import bpy
import os
import math
import random
from bpy.props import FloatProperty, IntProperty, StringProperty, BoolProperty, EnumProperty, PointerProperty, FloatVectorProperty
from bpy.types import PropertyGroup, Operator, Panel
from mathutils import Vector, Matrix, Euler

FUSELAGE_TEMPLATE = "GN_Fuselage_Template"
WINGS_TEMPLATE = "GN_Wings_Template"
TAILS_TEMPLATE = "GN_Tails_Template"
ENGINES_TEMPLATE = "GN_Engines_Template"
CANOPY_TEMPLATE = "GN_Canopy_Template"
CANNON_TEMPLATE = "GN_Cannon_Template"
GATLING_TEMPLATE = "GN_Gatling_Template"
RAILGUN_TEMPLATE = "GN_Railgun_Template"
NACELLE_TEMPLATE = "GN_Nacelle_Template"
VARIANT_COLLECTION = "FighterGen_Variants"
ASSEMBLY_COLLECTION = "FighterGen_Assembly"
RADIUS_CURVE_NODE_NAME = "RadiusCurveNode"
HEIGHT_CURVE_NODE_NAME = "HeightCurveNode"


# ---------------------------------------------------------------------------
# Robust socket helpers: fall back from identifier -> visible name -> name
# (including hidden sockets), so a template keeps working even if a node's
# exact socket identifier drifts between Blender versions.
# ---------------------------------------------------------------------------

def find_socket(node, is_input, identifier_or_name):
    collection = node.inputs if is_input else node.outputs
    for s in collection:
        if s.identifier == identifier_or_name:
            return s
    for s in collection:
        if s.name == identifier_or_name and not s.hide:
            return s
    for s in collection:
        if s.name == identifier_or_name:
            return s
    return None


def safe_link(links, from_socket, to_node, input_id):
    target = find_socket(to_node, True, input_id)
    if target:
        links.new(from_socket, target)
        return
    print(f"Warning: Safe link failed to find input socket '{input_id}' on node '{to_node.name}'")


def safe_link_output(links, from_node, output_id, to_socket):
    target = find_socket(from_node, False, output_id)
    if target:
        links.new(target, to_socket)
        return
    print(f"Warning: Safe link failed to find output socket '{output_id}' on node '{from_node.name}'")


# ---------------------------------------------------------------------------
# FUSELAGE: curve-line loft, radius/height profile each driven by an N-point
# Float Curve (see specialize_group_for_variant), plus a Subdivision Surface
# and Material socket at the end so it fits the same modifier-input pattern
# as the other categories below.
# ---------------------------------------------------------------------------

def build_fuselage_template():
    if FUSELAGE_TEMPLATE in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups[FUSELAGE_TEMPLATE])

    group = bpy.data.node_groups.new(FUSELAGE_TEMPLATE, 'GeometryNodeTree')
    group.inputs.new('NodeSocketFloat', 'Length')
    group.inputs.new('NodeSocketFloat', 'RadiusFloor')
    group.inputs.new('NodeSocketFloat', 'RadiusCeiling')
    group.inputs.new('NodeSocketFloat', 'HeightFloor')
    group.inputs.new('NodeSocketFloat', 'HeightCeiling')
    group.inputs.new('NodeSocketFloat', 'VerticalPinch')
    group.inputs.new('NodeSocketInt', 'CrossSectionSides')
    group.inputs.new('NodeSocketInt', 'Subdivision')
    group.inputs.new('NodeSocketMaterial', 'Material')
    group.outputs.new('NodeSocketGeometry', 'Geometry')

    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-1400, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (1400, 0)

    # Length runs along Blender's local +Y (forward). export_yup maps Blender Y -> glTF -Z,
    # matching the fighter-generator tool's forward=+/-Z convention (see FighterGenerator.ts).
    n_combine_end = nodes.new('ShaderNodeCombineXYZ')
    n_combine_end.location = (-1150, -200)
    links.new(n_in.outputs['Length'], n_combine_end.inputs['Y'])

    n_line = nodes.new('GeometryNodeCurvePrimitiveLine')
    n_line.location = (-950, 0)
    links.new(n_combine_end.outputs['Vector'], n_line.inputs['End'])

    n_resample = nodes.new('GeometryNodeResampleCurve')
    n_resample.location = (-750, 0)
    n_resample.mode = 'COUNT'
    n_resample.inputs['Count'].default_value = 64
    links.new(n_line.outputs['Curve'], n_resample.inputs['Curve'])

    n_param = nodes.new('GeometryNodeSplineParameter')
    n_param.location = (-950, -350)

    n_radius_curve = nodes.new('ShaderNodeFloatCurve')
    n_radius_curve.name = RADIUS_CURVE_NODE_NAME
    n_radius_curve.location = (-750, -350)
    links.new(n_param.outputs['Factor'], n_radius_curve.inputs['Value'])

    n_radius_map = nodes.new('ShaderNodeMapRange')
    n_radius_map.location = (-550, -350)
    n_radius_map.clamp = True
    n_radius_map.inputs['From Min'].default_value = 0.0
    n_radius_map.inputs['From Max'].default_value = 1.0
    links.new(n_radius_curve.outputs['Value'], n_radius_map.inputs['Value'])
    links.new(n_in.outputs['RadiusFloor'], n_radius_map.inputs['To Min'])
    links.new(n_in.outputs['RadiusCeiling'], n_radius_map.inputs['To Max'])

    n_setradius = nodes.new('GeometryNodeSetCurveRadius')
    n_setradius.location = (-350, 0)
    links.new(n_resample.outputs['Curve'], n_setradius.inputs['Curve'])
    links.new(n_radius_map.outputs['Result'], n_setradius.inputs['Radius'])

    n_profile = nodes.new('GeometryNodeCurvePrimitiveCircle')
    n_profile.location = (-350, 250)
    n_profile.mode = 'RADIUS'
    n_profile.inputs['Radius'].default_value = 1.0
    links.new(n_in.outputs['CrossSectionSides'], n_profile.inputs['Resolution'])

    n_to_mesh = nodes.new('GeometryNodeCurveToMesh')
    n_to_mesh.location = (-150, 0)
    n_to_mesh.inputs['Fill Caps'].default_value = True
    links.new(n_setradius.outputs['Curve'], n_to_mesh.inputs['Curve'])
    links.new(n_profile.outputs['Curve'], n_to_mesh.inputs['Profile Curve'])

    n_position = nodes.new('GeometryNodeInputPosition')
    n_position.location = (50, -450)
    n_sep = nodes.new('ShaderNodeSeparateXYZ')
    n_sep.location = (250, -450)
    links.new(n_position.outputs['Position'], n_sep.inputs['Vector'])

    n_t = nodes.new('ShaderNodeMath')
    n_t.location = (450, -500)
    n_t.operation = 'DIVIDE'
    links.new(n_sep.outputs['Y'], n_t.inputs[0])
    links.new(n_in.outputs['Length'], n_t.inputs[1])

    n_height_curve = nodes.new('ShaderNodeFloatCurve')
    n_height_curve.name = HEIGHT_CURVE_NODE_NAME
    n_height_curve.location = (650, -500)
    links.new(n_t.outputs['Value'], n_height_curve.inputs['Value'])

    n_height_map = nodes.new('ShaderNodeMapRange')
    n_height_map.location = (850, -500)
    n_height_map.clamp = True
    n_height_map.inputs['From Min'].default_value = 0.0
    n_height_map.inputs['From Max'].default_value = 1.0
    links.new(n_height_curve.outputs['Value'], n_height_map.inputs['Value'])
    links.new(n_in.outputs['HeightFloor'], n_height_map.inputs['To Min'])
    links.new(n_in.outputs['HeightCeiling'], n_height_map.inputs['To Max'])

    n_new_z = nodes.new('ShaderNodeMath')
    n_new_z.location = (450, -650)
    n_new_z.operation = 'MULTIPLY'
    links.new(n_sep.outputs['Z'], n_new_z.inputs[0])
    links.new(n_height_map.outputs['Result'], n_new_z.inputs[1])

    # Vertical pinch: instead of a perfectly symmetric ellipse (equal +Z/-Z radius from a
    # fixed centerline -- the "4-way even" look), scale the top half and bottom half of
    # the cross-section by different amounts so the silhouette narrows toward a flat/sharp
    # edge on one side instead of bulging evenly all around. sign(local Z) picks which
    # half a vertex is on; +1 grows that half, -1 shrinks it (toward a flat edge at 0).
    n_vp_sign = nodes.new('ShaderNodeMath')
    n_vp_sign.location = (450, -800)
    n_vp_sign.operation = 'SIGN'
    links.new(n_sep.outputs['Z'], n_vp_sign.inputs[0])

    n_vp_term = nodes.new('ShaderNodeMath')
    n_vp_term.location = (650, -800)
    n_vp_term.operation = 'MULTIPLY'
    links.new(n_vp_sign.outputs['Value'], n_vp_term.inputs[0])
    links.new(n_in.outputs['VerticalPinch'], n_vp_term.inputs[1])

    n_vp_scale = nodes.new('ShaderNodeMath')
    n_vp_scale.location = (850, -800)
    n_vp_scale.operation = 'ADD'
    n_vp_scale.inputs[0].default_value = 1.0
    links.new(n_vp_term.outputs['Value'], n_vp_scale.inputs[1])

    n_vp_scale_clamped = nodes.new('ShaderNodeMath')
    n_vp_scale_clamped.location = (1050, -800)
    n_vp_scale_clamped.operation = 'MAXIMUM'
    n_vp_scale_clamped.inputs[1].default_value = 0.0
    links.new(n_vp_scale.outputs['Value'], n_vp_scale_clamped.inputs[0])

    n_new_z_asym = nodes.new('ShaderNodeMath')
    n_new_z_asym.location = (650, -650)
    n_new_z_asym.operation = 'MULTIPLY'
    links.new(n_new_z.outputs['Value'], n_new_z_asym.inputs[0])
    links.new(n_vp_scale_clamped.outputs['Value'], n_new_z_asym.inputs[1])

    n_recombine = nodes.new('ShaderNodeCombineXYZ')
    n_recombine.location = (850, -650)
    links.new(n_sep.outputs['X'], n_recombine.inputs['X'])
    links.new(n_sep.outputs['Y'], n_recombine.inputs['Y'])
    links.new(n_new_z_asym.outputs['Value'], n_recombine.inputs['Z'])

    n_setpos = nodes.new('GeometryNodeSetPosition')
    n_setpos.location = (150, 0)
    links.new(n_to_mesh.outputs['Mesh'], n_setpos.inputs['Geometry'])
    links.new(n_recombine.outputs['Vector'], n_setpos.inputs['Position'])

    n_subdiv = nodes.new('GeometryNodeSubdivisionSurface')
    n_subdiv.location = (400, 0)
    links.new(n_setpos.outputs['Geometry'], n_subdiv.inputs['Mesh'])
    links.new(n_in.outputs['Subdivision'], n_subdiv.inputs['Level'])

    n_shade = nodes.new('GeometryNodeSetShadeSmooth')
    n_shade.location = (900, 0)
    n_shade.inputs['Shade Smooth'].default_value = False
    links.new(n_subdiv.outputs['Mesh'], n_shade.inputs['Geometry'])

    n_set_mat = nodes.new('GeometryNodeSetMaterial')
    n_set_mat.location = (1050, 0)
    links.new(n_shade.outputs['Geometry'], n_set_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_set_mat.inputs['Material'])
    links.new(n_set_mat.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


# ---------------------------------------------------------------------------
# TAILS: same recipe as wings, axes rotated 90 deg -- span runs along local Z
# (vertical fin) instead of X, thickness runs along local X instead of Z.
# ---------------------------------------------------------------------------

def build_tails_template():
    if TAILS_TEMPLATE in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups[TAILS_TEMPLATE])

    group = bpy.data.node_groups.new(TAILS_TEMPLATE, 'GeometryNodeTree')
    group.inputs.new('NodeSocketFloat', 'Span')
    group.inputs.new('NodeSocketFloat', 'Thickness')
    group.inputs.new('NodeSocketFloat', 'ThicknessMid')
    group.inputs.new('NodeSocketFloat', 'RootThickness')
    group.inputs.new('NodeSocketFloat', 'TipThickness')
    group.inputs.new('NodeSocketFloat', 'RootChord')
    group.inputs.new('NodeSocketFloat', 'TipChord')
    group.inputs.new('NodeSocketFloat', 'Sweep')
    group.inputs.new('NodeSocketFloat', 'Dihedral')
    group.inputs.new('NodeSocketFloat', 'Twist')
    group.inputs.new('NodeSocketFloat', 'AirfoilSharpness')
    group.inputs.new('NodeSocketFloat', 'LeadingEdgeMid')
    group.inputs.new('NodeSocketFloat', 'TrailingEdgeMid')
    group.inputs.new('NodeSocketFloat', 'RootOffset')
    group.inputs.new('NodeSocketInt', 'Subdivision')
    group.inputs.new('NodeSocketMaterial', 'Material')
    group.outputs.new('NodeSocketGeometry', 'Geometry')

    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-1000, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (2000, 0)

    n_cube = nodes.new('GeometryNodeMeshCube')
    n_cube.location = (-800, 200)
    n_cube.inputs['Size'].default_value = (1.0, 1.0, 1.0)
    n_cube.inputs['Vertices X'].default_value = 2
    n_cube.inputs['Vertices Y'].default_value = 16
    n_cube.inputs['Vertices Z'].default_value = 32

    n_pos = nodes.new('GeometryNodeInputPosition')
    n_pos.location = (-800, -100)
    n_sep = nodes.new('ShaderNodeSeparateXYZ')
    n_sep.location = (-600, -100)
    links.new(n_pos.outputs['Position'], n_sep.inputs['Vector'])

    # --- span axis (Z, 0..1) ---
    n_z_offset = nodes.new('ShaderNodeMath')
    n_z_offset.location = (-450, -50)
    n_z_offset.operation = 'ADD'
    links.new(n_sep.outputs['Z'], n_z_offset.inputs[0])
    n_z_offset.inputs[1].default_value = 0.5

    n_new_z_val = nodes.new('ShaderNodeMath')
    n_new_z_val.location = (-250, -50)
    n_new_z_val.operation = 'MULTIPLY'
    links.new(n_z_offset.outputs['Value'], n_new_z_val.inputs[0])
    links.new(n_in.outputs['Span'], n_new_z_val.inputs[1])

    # --- chord axis (Y, 0..1) leading/trailing edge curves ---
    n_y_offset = nodes.new('ShaderNodeMath')
    n_y_offset.location = (-450, -250)
    n_y_offset.operation = 'ADD'
    links.new(n_sep.outputs['Y'], n_y_offset.inputs[0])
    n_y_offset.inputs[1].default_value = 0.5

    n_1_minus_z = nodes.new('ShaderNodeMath')
    n_1_minus_z.location = (-250, -250)
    n_1_minus_z.operation = 'SUBTRACT'
    n_1_minus_z.inputs[0].default_value = 1.0
    links.new(n_z_offset.outputs['Value'], n_1_minus_z.inputs[1])

    n_term_mid_z = nodes.new('ShaderNodeMath')
    n_term_mid_z.location = (-50, -250)
    n_term_mid_z.operation = 'MULTIPLY'
    links.new(n_1_minus_z.outputs['Value'], n_term_mid_z.inputs[0])
    links.new(n_z_offset.outputs['Value'], n_term_mid_z.inputs[1])

    n_term_mid_z_2 = nodes.new('ShaderNodeMath')
    n_term_mid_z_2.location = (150, -250)
    n_term_mid_z_2.operation = 'MULTIPLY'
    links.new(n_term_mid_z.outputs['Value'], n_term_mid_z_2.inputs[0])
    n_term_mid_z_2.inputs[1].default_value = 2.0

    n_front_mid = nodes.new('ShaderNodeMath')
    n_front_mid.location = (350, -250)
    n_front_mid.operation = 'MULTIPLY'
    links.new(n_term_mid_z_2.outputs['Value'], n_front_mid.inputs[0])
    links.new(n_in.outputs['LeadingEdgeMid'], n_front_mid.inputs[1])

    n_z_sq = nodes.new('ShaderNodeMath')
    n_z_sq.location = (150, -400)
    n_z_sq.operation = 'MULTIPLY'
    links.new(n_z_offset.outputs['Value'], n_z_sq.inputs[0])
    links.new(n_z_offset.outputs['Value'], n_z_sq.inputs[1])

    n_front_tip = nodes.new('ShaderNodeMath')
    n_front_tip.location = (350, -400)
    n_front_tip.operation = 'MULTIPLY'
    links.new(n_z_sq.outputs['Value'], n_front_tip.inputs[0])
    links.new(n_in.outputs['Sweep'], n_front_tip.inputs[1])

    n_front_edge_y = nodes.new('ShaderNodeMath')
    n_front_edge_y.location = (550, -300)
    n_front_edge_y.operation = 'ADD'
    links.new(n_front_mid.outputs['Value'], n_front_edge_y.inputs[0])
    links.new(n_front_tip.outputs['Value'], n_front_edge_y.inputs[1])

    n_1_minus_z_sq = nodes.new('ShaderNodeMath')
    n_1_minus_z_sq.location = (150, -550)
    n_1_minus_z_sq.operation = 'MULTIPLY'
    links.new(n_1_minus_z.outputs['Value'], n_1_minus_z_sq.inputs[0])
    links.new(n_1_minus_z.outputs['Value'], n_1_minus_z_sq.inputs[1])

    n_rear_root = nodes.new('ShaderNodeMath')
    n_rear_root.location = (350, -550)
    n_rear_root.operation = 'MULTIPLY'
    links.new(n_1_minus_z_sq.outputs['Value'], n_rear_root.inputs[0])
    links.new(n_in.outputs['RootChord'], n_rear_root.inputs[1])

    n_rear_root_neg = nodes.new('ShaderNodeMath')
    n_rear_root_neg.location = (550, -550)
    n_rear_root_neg.operation = 'MULTIPLY'
    links.new(n_rear_root.outputs['Value'], n_rear_root_neg.inputs[0])
    n_rear_root_neg.inputs[1].default_value = -1.0

    n_rear_mid = nodes.new('ShaderNodeMath')
    n_rear_mid.location = (350, -700)
    n_rear_mid.operation = 'MULTIPLY'
    links.new(n_term_mid_z_2.outputs['Value'], n_rear_mid.inputs[0])
    links.new(n_in.outputs['TrailingEdgeMid'], n_rear_mid.inputs[1])

    n_sweep_minus_tip = nodes.new('ShaderNodeMath')
    n_sweep_minus_tip.location = (150, -850)
    n_sweep_minus_tip.operation = 'SUBTRACT'
    links.new(n_in.outputs['Sweep'], n_sweep_minus_tip.inputs[0])
    links.new(n_in.outputs['TipChord'], n_sweep_minus_tip.inputs[1])

    n_rear_tip = nodes.new('ShaderNodeMath')
    n_rear_tip.location = (350, -850)
    n_rear_tip.operation = 'MULTIPLY'
    links.new(n_z_sq.outputs['Value'], n_rear_tip.inputs[0])
    links.new(n_sweep_minus_tip.outputs['Value'], n_rear_tip.inputs[1])

    n_rear_edge_y_temp = nodes.new('ShaderNodeMath')
    n_rear_edge_y_temp.location = (550, -750)
    n_rear_edge_y_temp.operation = 'ADD'
    links.new(n_rear_root_neg.outputs['Value'], n_rear_edge_y_temp.inputs[0])
    links.new(n_rear_mid.outputs['Value'], n_rear_edge_y_temp.inputs[1])

    n_rear_edge_y = nodes.new('ShaderNodeMath')
    n_rear_edge_y.location = (750, -700)
    n_rear_edge_y.operation = 'ADD'
    links.new(n_rear_edge_y_temp.outputs['Value'], n_rear_edge_y.inputs[0])
    links.new(n_rear_tip.outputs['Value'], n_rear_edge_y.inputs[1])

    n_one_minus_y = nodes.new('ShaderNodeMath')
    n_one_minus_y.location = (-250, -450)
    n_one_minus_y.operation = 'SUBTRACT'
    n_one_minus_y.inputs[0].default_value = 1.0
    links.new(n_y_offset.outputs['Value'], n_one_minus_y.inputs[1])

    n_term1 = nodes.new('ShaderNodeMath')
    n_term1.location = (900, -350)
    n_term1.operation = 'MULTIPLY'
    links.new(n_y_offset.outputs['Value'], n_term1.inputs[0])
    links.new(n_front_edge_y.outputs['Value'], n_term1.inputs[1])

    n_term2 = nodes.new('ShaderNodeMath')
    n_term2.location = (900, -550)
    n_term2.operation = 'MULTIPLY'
    links.new(n_one_minus_y.outputs['Value'], n_term2.inputs[0])
    links.new(n_rear_edge_y.outputs['Value'], n_term2.inputs[1])

    n_new_y = nodes.new('ShaderNodeMath')
    n_new_y.location = (1100, -450)
    n_new_y.operation = 'ADD'
    links.new(n_term1.outputs['Value'], n_new_y.inputs[0])
    links.new(n_term2.outputs['Value'], n_new_y.inputs[1])

    # --- airfoil thickness profile (X) ---
    n_half_sharp = nodes.new('ShaderNodeMath')
    n_half_sharp.location = (-50, -450)
    n_half_sharp.operation = 'MULTIPLY'
    links.new(n_in.outputs['AirfoilSharpness'], n_half_sharp.inputs[0])
    n_half_sharp.inputs[1].default_value = 0.5

    n_front_airfoil = nodes.new('ShaderNodeMath')
    n_front_airfoil.location = (150, -1000)
    n_front_airfoil.operation = 'POWER'
    links.new(n_y_offset.outputs['Value'], n_front_airfoil.inputs[0])
    links.new(n_half_sharp.outputs['Value'], n_front_airfoil.inputs[1])

    n_rear_airfoil = nodes.new('ShaderNodeMath')
    n_rear_airfoil.location = (150, -1150)
    n_rear_airfoil.operation = 'POWER'
    links.new(n_one_minus_y.outputs['Value'], n_rear_airfoil.inputs[0])
    links.new(n_in.outputs['AirfoilSharpness'], n_rear_airfoil.inputs[1])

    n_airfoil_mult = nodes.new('ShaderNodeMath')
    n_airfoil_mult.location = (350, -1100)
    n_airfoil_mult.operation = 'MULTIPLY'
    links.new(n_front_airfoil.outputs['Value'], n_airfoil_mult.inputs[0])
    links.new(n_rear_airfoil.outputs['Value'], n_airfoil_mult.inputs[1])

    n_airfoil_f = nodes.new('ShaderNodeMath')
    n_airfoil_f.location = (550, -1100)
    n_airfoil_f.operation = 'MULTIPLY'
    links.new(n_airfoil_mult.outputs['Value'], n_airfoil_f.inputs[0])
    n_airfoil_f.inputs[1].default_value = 1.8

    n_thick_mid = nodes.new('ShaderNodeMath')
    n_thick_mid.location = (350, -1250)
    n_thick_mid.operation = 'MULTIPLY'
    links.new(n_term_mid_z_2.outputs['Value'], n_thick_mid.inputs[0])
    links.new(n_in.outputs['ThicknessMid'], n_thick_mid.inputs[1])

    # root-to-tip thickness taper: linear blend between RootThickness (z=0) and
    # TipThickness (z=1), so the balance is user-adjustable/reversible instead of
    # a fixed root-biased curve.
    n_root_thick_term = nodes.new('ShaderNodeMath')
    n_root_thick_term.location = (350, -1400)
    n_root_thick_term.operation = 'MULTIPLY'
    links.new(n_1_minus_z.outputs['Value'], n_root_thick_term.inputs[0])
    links.new(n_in.outputs['RootThickness'], n_root_thick_term.inputs[1])

    n_tip_thick_term = nodes.new('ShaderNodeMath')
    n_tip_thick_term.location = (350, -1500)
    n_tip_thick_term.operation = 'MULTIPLY'
    links.new(n_z_offset.outputs['Value'], n_tip_thick_term.inputs[0])
    links.new(n_in.outputs['TipThickness'], n_tip_thick_term.inputs[1])

    n_thick_profile_temp = nodes.new('ShaderNodeMath')
    n_thick_profile_temp.location = (550, -1250)
    n_thick_profile_temp.operation = 'ADD'
    links.new(n_root_thick_term.outputs['Value'], n_thick_profile_temp.inputs[0])
    links.new(n_tip_thick_term.outputs['Value'], n_thick_profile_temp.inputs[1])

    n_thick_profile = nodes.new('ShaderNodeMath')
    n_thick_profile.location = (750, -1250)
    n_thick_profile.operation = 'ADD'
    links.new(n_thick_profile_temp.outputs['Value'], n_thick_profile.inputs[0])
    links.new(n_thick_mid.outputs['Value'], n_thick_profile.inputs[1])

    n_x_thick = nodes.new('ShaderNodeMath')
    n_x_thick.location = (900, -1250)
    n_x_thick.operation = 'MULTIPLY'
    links.new(n_sep.outputs['X'], n_x_thick.inputs[0])
    links.new(n_in.outputs['Thickness'], n_x_thick.inputs[1])

    n_x_taper = nodes.new('ShaderNodeMath')
    n_x_taper.location = (1100, -1250)
    n_x_taper.operation = 'MULTIPLY'
    links.new(n_x_thick.outputs['Value'], n_x_taper.inputs[0])
    links.new(n_thick_profile.outputs['Value'], n_x_taper.inputs[1])

    n_x_airfoil = nodes.new('ShaderNodeMath')
    n_x_airfoil.location = (1300, -1200)
    n_x_airfoil.operation = 'MULTIPLY'
    links.new(n_x_taper.outputs['Value'], n_x_airfoil.inputs[0])
    links.new(n_airfoil_f.outputs['Value'], n_x_airfoil.inputs[1])

    n_edge_offset = nodes.new('ShaderNodeMath')
    n_edge_offset.location = (1300, -1350)
    n_edge_offset.operation = 'MULTIPLY'
    links.new(n_z_offset.outputs['Value'], n_edge_offset.inputs[0])
    links.new(n_x_airfoil.outputs['Value'], n_edge_offset.inputs[1])

    n_edge_scale = nodes.new('ShaderNodeMath')
    n_edge_scale.location = (1500, -1350)
    n_edge_scale.operation = 'MULTIPLY'
    links.new(n_edge_offset.outputs['Value'], n_edge_scale.inputs[0])
    n_edge_scale.inputs[1].default_value = 0.45

    n_new_x_flat = nodes.new('ShaderNodeMath')
    n_new_x_flat.location = (1650, -1200)
    n_new_x_flat.operation = 'SUBTRACT'
    links.new(n_x_airfoil.outputs['Value'], n_new_x_flat.inputs[0])
    links.new(n_edge_scale.outputs['Value'], n_new_x_flat.inputs[1])

    n_dih_rad = nodes.new('ShaderNodeMath')
    n_dih_rad.location = (1500, -1200)
    n_dih_rad.operation = 'RADIANS'
    links.new(n_in.outputs['Dihedral'], n_dih_rad.inputs[0])

    n_dih_tan = nodes.new('ShaderNodeMath')
    n_dih_tan.location = (1650, -1200)
    n_dih_tan.operation = 'TANGENT'
    links.new(n_dih_rad.outputs['Value'], n_dih_tan.inputs[0])

    n_dihedral_offset = nodes.new('ShaderNodeMath')
    n_dihedral_offset.location = (1800, -1200)
    n_dihedral_offset.operation = 'MULTIPLY'
    links.new(n_new_z_val.outputs['Value'], n_dihedral_offset.inputs[0])
    links.new(n_dih_tan.outputs['Value'], n_dihedral_offset.inputs[1])

    n_new_x = nodes.new('ShaderNodeMath')
    n_new_x.location = (1950, -1200)
    n_new_x.operation = 'ADD'
    links.new(n_new_x_flat.outputs['Value'], n_new_x.inputs[0])
    links.new(n_dihedral_offset.outputs['Value'], n_new_x.inputs[1])

    n_root_offset_x = nodes.new('ShaderNodeMath')
    n_root_offset_x.location = (2100, -1200)
    n_root_offset_x.operation = 'ADD'
    links.new(n_new_x.outputs['Value'], n_root_offset_x.inputs[0])
    links.new(n_in.outputs['RootOffset'], n_root_offset_x.inputs[1])

    n_comb = nodes.new('ShaderNodeCombineXYZ')
    n_comb.location = (1300, 200)
    links.new(n_root_offset_x.outputs['Value'], n_comb.inputs['X'])
    links.new(n_new_y.outputs['Value'], n_comb.inputs['Y'])
    links.new(n_new_z_val.outputs['Value'], n_comb.inputs['Z'])

    n_setpos = nodes.new('GeometryNodeSetPosition')
    n_setpos.location = (1500, 200)
    links.new(n_cube.outputs['Mesh'], n_setpos.inputs['Geometry'])
    links.new(n_comb.outputs['Vector'], n_setpos.inputs['Position'])

    # --- twist (rotate around the span axis) ---
    n_twist_angle = nodes.new('ShaderNodeMath')
    n_twist_angle.location = (1500, 0)
    n_twist_angle.operation = 'MULTIPLY'
    links.new(n_z_offset.outputs['Value'], n_twist_angle.inputs[0])
    links.new(n_in.outputs['Twist'], n_twist_angle.inputs[1])

    n_geom_pos = nodes.new('GeometryNodeInputPosition')
    n_geom_pos.location = (1300, -50)
    n_vec_rot = nodes.new('ShaderNodeVectorRotate')
    n_vec_rot.location = (1700, 0)
    n_vec_rot.rotation_type = 'AXIS_ANGLE'
    n_vec_rot.inputs['Axis'].default_value = (0.0, 0.0, 1.0)
    links.new(n_geom_pos.outputs['Position'], n_vec_rot.inputs['Vector'])
    links.new(n_twist_angle.outputs['Value'], n_vec_rot.inputs['Angle'])

    n_settwist = nodes.new('GeometryNodeSetPosition')
    n_settwist.location = (1900, 200)
    links.new(n_setpos.outputs['Geometry'], n_settwist.inputs['Geometry'])
    links.new(n_vec_rot.outputs['Vector'], n_settwist.inputs['Position'])

    n_subdiv = nodes.new('GeometryNodeSubdivisionSurface')
    n_subdiv.location = (2100, 200)
    links.new(n_settwist.outputs['Geometry'], n_subdiv.inputs['Mesh'])
    links.new(n_in.outputs['Subdivision'], n_subdiv.inputs['Level'])

    n_shade = nodes.new('GeometryNodeSetShadeSmooth')
    n_shade.location = (2300, 200)
    n_shade.inputs['Shade Smooth'].default_value = True
    links.new(n_subdiv.outputs['Mesh'], n_shade.inputs['Geometry'])

    n_set_mat = nodes.new('GeometryNodeSetMaterial')
    n_set_mat.location = (2500, 200)
    links.new(n_shade.outputs['Geometry'], n_set_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_set_mat.inputs['Material'])
    links.new(n_set_mat.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


# ---------------------------------------------------------------------------
# WINGS: a subdivided cube deformed per-vertex into a double-delta / crescent
# planform (front_mid/rear_mid control the leading/trailing edge kink) with a
# parametric airfoil cross-section (front^sharp * (1-front)^sharp * 1.8,
# see AirfoilSharpness) and a tip that crushes the upper surface toward the
# lower one for a sharp stealth-style edge, then dihedral + twist.
# X = span (root..tip), Y = chord (leading..trailing edge), Z = thickness.
# ---------------------------------------------------------------------------

def build_wings_template():
    if WINGS_TEMPLATE in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups[WINGS_TEMPLATE])

    group = bpy.data.node_groups.new(WINGS_TEMPLATE, 'GeometryNodeTree')
    group.inputs.new('NodeSocketFloat', 'Span')
    group.inputs.new('NodeSocketFloat', 'Thickness')
    group.inputs.new('NodeSocketFloat', 'ThicknessMid')
    group.inputs.new('NodeSocketFloat', 'RootThickness')
    group.inputs.new('NodeSocketFloat', 'TipThickness')
    group.inputs.new('NodeSocketFloat', 'RootChord')
    group.inputs.new('NodeSocketFloat', 'TipChord')
    group.inputs.new('NodeSocketFloat', 'Sweep')
    group.inputs.new('NodeSocketFloat', 'Dihedral')
    group.inputs.new('NodeSocketFloat', 'Twist')
    group.inputs.new('NodeSocketFloat', 'AirfoilSharpness')
    group.inputs.new('NodeSocketFloat', 'LeadingEdgeMid')
    group.inputs.new('NodeSocketFloat', 'TrailingEdgeMid')
    group.inputs.new('NodeSocketFloat', 'RootOffset')
    group.inputs.new('NodeSocketInt', 'Subdivision')
    group.inputs.new('NodeSocketMaterial', 'Material')
    group.outputs.new('NodeSocketGeometry', 'Geometry')

    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-1000, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (2000, 0)

    n_cube = nodes.new('GeometryNodeMeshCube')
    n_cube.location = (-800, 200)
    n_cube.inputs['Size'].default_value = (1.0, 1.0, 1.0)
    n_cube.inputs['Vertices X'].default_value = 32
    n_cube.inputs['Vertices Y'].default_value = 16
    n_cube.inputs['Vertices Z'].default_value = 2

    n_pos = nodes.new('GeometryNodeInputPosition')
    n_pos.location = (-800, -100)
    n_sep = nodes.new('ShaderNodeSeparateXYZ')
    n_sep.location = (-600, -100)
    links.new(n_pos.outputs['Position'], n_sep.inputs['Vector'])

    # --- span axis (X, 0..1) ---
    n_x_offset = nodes.new('ShaderNodeMath')
    n_x_offset.location = (-450, -50)
    n_x_offset.operation = 'ADD'
    links.new(n_sep.outputs['X'], n_x_offset.inputs[0])
    n_x_offset.inputs[1].default_value = 0.5

    n_new_x_val = nodes.new('ShaderNodeMath')
    n_new_x_val.location = (-250, -50)
    n_new_x_val.operation = 'MULTIPLY'
    links.new(n_x_offset.outputs['Value'], n_new_x_val.inputs[0])
    links.new(n_in.outputs['Span'], n_new_x_val.inputs[1])

    n_new_x = nodes.new('ShaderNodeMath')
    n_new_x.location = (-50, -50)
    n_new_x.operation = 'MULTIPLY'
    n_new_x.inputs[1].default_value = 1.0
    links.new(n_new_x_val.outputs['Value'], n_new_x.inputs[0])

    # --- chord axis (Y, 0..1) leading/trailing edge curves ---
    n_y_offset = nodes.new('ShaderNodeMath')
    n_y_offset.location = (-450, -250)
    n_y_offset.operation = 'ADD'
    links.new(n_sep.outputs['Y'], n_y_offset.inputs[0])
    n_y_offset.inputs[1].default_value = 0.5

    n_1_minus_x = nodes.new('ShaderNodeMath')
    n_1_minus_x.location = (-250, -250)
    n_1_minus_x.operation = 'SUBTRACT'
    n_1_minus_x.inputs[0].default_value = 1.0
    links.new(n_x_offset.outputs['Value'], n_1_minus_x.inputs[1])

    n_term_mid_x = nodes.new('ShaderNodeMath')
    n_term_mid_x.location = (-50, -250)
    n_term_mid_x.operation = 'MULTIPLY'
    links.new(n_1_minus_x.outputs['Value'], n_term_mid_x.inputs[0])
    links.new(n_x_offset.outputs['Value'], n_term_mid_x.inputs[1])

    n_term_mid_x_2 = nodes.new('ShaderNodeMath')
    n_term_mid_x_2.location = (150, -250)
    n_term_mid_x_2.operation = 'MULTIPLY'
    links.new(n_term_mid_x.outputs['Value'], n_term_mid_x_2.inputs[0])
    n_term_mid_x_2.inputs[1].default_value = 2.0

    n_front_mid = nodes.new('ShaderNodeMath')
    n_front_mid.location = (350, -250)
    n_front_mid.operation = 'MULTIPLY'
    links.new(n_term_mid_x_2.outputs['Value'], n_front_mid.inputs[0])
    links.new(n_in.outputs['LeadingEdgeMid'], n_front_mid.inputs[1])

    n_x_sq = nodes.new('ShaderNodeMath')
    n_x_sq.location = (150, -400)
    n_x_sq.operation = 'MULTIPLY'
    links.new(n_x_offset.outputs['Value'], n_x_sq.inputs[0])
    links.new(n_x_offset.outputs['Value'], n_x_sq.inputs[1])

    n_front_tip = nodes.new('ShaderNodeMath')
    n_front_tip.location = (350, -400)
    n_front_tip.operation = 'MULTIPLY'
    links.new(n_x_sq.outputs['Value'], n_front_tip.inputs[0])
    links.new(n_in.outputs['Sweep'], n_front_tip.inputs[1])

    n_front_edge_y = nodes.new('ShaderNodeMath')
    n_front_edge_y.location = (550, -300)
    n_front_edge_y.operation = 'ADD'
    links.new(n_front_mid.outputs['Value'], n_front_edge_y.inputs[0])
    links.new(n_front_tip.outputs['Value'], n_front_edge_y.inputs[1])

    n_1_minus_x_sq = nodes.new('ShaderNodeMath')
    n_1_minus_x_sq.location = (150, -550)
    n_1_minus_x_sq.operation = 'MULTIPLY'
    links.new(n_1_minus_x.outputs['Value'], n_1_minus_x_sq.inputs[0])
    links.new(n_1_minus_x.outputs['Value'], n_1_minus_x_sq.inputs[1])

    n_rear_root = nodes.new('ShaderNodeMath')
    n_rear_root.location = (350, -550)
    n_rear_root.operation = 'MULTIPLY'
    links.new(n_1_minus_x_sq.outputs['Value'], n_rear_root.inputs[0])
    links.new(n_in.outputs['RootChord'], n_rear_root.inputs[1])

    n_rear_root_neg = nodes.new('ShaderNodeMath')
    n_rear_root_neg.location = (550, -550)
    n_rear_root_neg.operation = 'MULTIPLY'
    links.new(n_rear_root.outputs['Value'], n_rear_root_neg.inputs[0])
    n_rear_root_neg.inputs[1].default_value = -1.0

    n_rear_mid = nodes.new('ShaderNodeMath')
    n_rear_mid.location = (350, -700)
    n_rear_mid.operation = 'MULTIPLY'
    links.new(n_term_mid_x_2.outputs['Value'], n_rear_mid.inputs[0])
    links.new(n_in.outputs['TrailingEdgeMid'], n_rear_mid.inputs[1])

    n_sweep_minus_tip = nodes.new('ShaderNodeMath')
    n_sweep_minus_tip.location = (150, -850)
    n_sweep_minus_tip.operation = 'SUBTRACT'
    links.new(n_in.outputs['Sweep'], n_sweep_minus_tip.inputs[0])
    links.new(n_in.outputs['TipChord'], n_sweep_minus_tip.inputs[1])

    n_rear_tip = nodes.new('ShaderNodeMath')
    n_rear_tip.location = (350, -850)
    n_rear_tip.operation = 'MULTIPLY'
    links.new(n_x_sq.outputs['Value'], n_rear_tip.inputs[0])
    links.new(n_sweep_minus_tip.outputs['Value'], n_rear_tip.inputs[1])

    n_rear_edge_y_temp = nodes.new('ShaderNodeMath')
    n_rear_edge_y_temp.location = (550, -750)
    n_rear_edge_y_temp.operation = 'ADD'
    links.new(n_rear_root_neg.outputs['Value'], n_rear_edge_y_temp.inputs[0])
    links.new(n_rear_mid.outputs['Value'], n_rear_edge_y_temp.inputs[1])

    n_rear_edge_y = nodes.new('ShaderNodeMath')
    n_rear_edge_y.location = (750, -700)
    n_rear_edge_y.operation = 'ADD'
    links.new(n_rear_edge_y_temp.outputs['Value'], n_rear_edge_y.inputs[0])
    links.new(n_rear_tip.outputs['Value'], n_rear_edge_y.inputs[1])

    n_one_minus_y = nodes.new('ShaderNodeMath')
    n_one_minus_y.location = (-250, -450)
    n_one_minus_y.operation = 'SUBTRACT'
    n_one_minus_y.inputs[0].default_value = 1.0
    links.new(n_y_offset.outputs['Value'], n_one_minus_y.inputs[1])

    n_term1 = nodes.new('ShaderNodeMath')
    n_term1.location = (900, -350)
    n_term1.operation = 'MULTIPLY'
    links.new(n_y_offset.outputs['Value'], n_term1.inputs[0])
    links.new(n_front_edge_y.outputs['Value'], n_term1.inputs[1])

    n_term2 = nodes.new('ShaderNodeMath')
    n_term2.location = (900, -550)
    n_term2.operation = 'MULTIPLY'
    links.new(n_one_minus_y.outputs['Value'], n_term2.inputs[0])
    links.new(n_rear_edge_y.outputs['Value'], n_term2.inputs[1])

    n_new_y = nodes.new('ShaderNodeMath')
    n_new_y.location = (1100, -450)
    n_new_y.operation = 'ADD'
    links.new(n_term1.outputs['Value'], n_new_y.inputs[0])
    links.new(n_term2.outputs['Value'], n_new_y.inputs[1])

    # --- airfoil thickness profile (Z) ---
    n_half_sharp = nodes.new('ShaderNodeMath')
    n_half_sharp.location = (-50, -450)
    n_half_sharp.operation = 'MULTIPLY'
    links.new(n_in.outputs['AirfoilSharpness'], n_half_sharp.inputs[0])
    n_half_sharp.inputs[1].default_value = 0.5

    n_front_airfoil = nodes.new('ShaderNodeMath')
    n_front_airfoil.location = (150, -1000)
    n_front_airfoil.operation = 'POWER'
    links.new(n_y_offset.outputs['Value'], n_front_airfoil.inputs[0])
    links.new(n_half_sharp.outputs['Value'], n_front_airfoil.inputs[1])

    n_rear_airfoil = nodes.new('ShaderNodeMath')
    n_rear_airfoil.location = (150, -1150)
    n_rear_airfoil.operation = 'POWER'
    links.new(n_one_minus_y.outputs['Value'], n_rear_airfoil.inputs[0])
    links.new(n_in.outputs['AirfoilSharpness'], n_rear_airfoil.inputs[1])

    n_airfoil_mult = nodes.new('ShaderNodeMath')
    n_airfoil_mult.location = (350, -1100)
    n_airfoil_mult.operation = 'MULTIPLY'
    links.new(n_front_airfoil.outputs['Value'], n_airfoil_mult.inputs[0])
    links.new(n_rear_airfoil.outputs['Value'], n_airfoil_mult.inputs[1])

    n_airfoil_f = nodes.new('ShaderNodeMath')
    n_airfoil_f.location = (550, -1100)
    n_airfoil_f.operation = 'MULTIPLY'
    links.new(n_airfoil_mult.outputs['Value'], n_airfoil_f.inputs[0])
    n_airfoil_f.inputs[1].default_value = 1.8

    n_thick_mid = nodes.new('ShaderNodeMath')
    n_thick_mid.location = (350, -1250)
    n_thick_mid.operation = 'MULTIPLY'
    links.new(n_term_mid_x_2.outputs['Value'], n_thick_mid.inputs[0])
    links.new(n_in.outputs['ThicknessMid'], n_thick_mid.inputs[1])

    # root-to-tip thickness taper: linear blend between RootThickness (x=0) and
    # TipThickness (x=1), so the balance is user-adjustable/reversible instead of
    # a fixed root-biased curve.
    n_root_thick_term = nodes.new('ShaderNodeMath')
    n_root_thick_term.location = (350, -1400)
    n_root_thick_term.operation = 'MULTIPLY'
    links.new(n_1_minus_x.outputs['Value'], n_root_thick_term.inputs[0])
    links.new(n_in.outputs['RootThickness'], n_root_thick_term.inputs[1])

    n_tip_thick_term = nodes.new('ShaderNodeMath')
    n_tip_thick_term.location = (350, -1500)
    n_tip_thick_term.operation = 'MULTIPLY'
    links.new(n_x_offset.outputs['Value'], n_tip_thick_term.inputs[0])
    links.new(n_in.outputs['TipThickness'], n_tip_thick_term.inputs[1])

    n_thick_profile_temp = nodes.new('ShaderNodeMath')
    n_thick_profile_temp.location = (550, -1250)
    n_thick_profile_temp.operation = 'ADD'
    links.new(n_root_thick_term.outputs['Value'], n_thick_profile_temp.inputs[0])
    links.new(n_tip_thick_term.outputs['Value'], n_thick_profile_temp.inputs[1])

    n_thick_profile = nodes.new('ShaderNodeMath')
    n_thick_profile.location = (750, -1250)
    n_thick_profile.operation = 'ADD'
    links.new(n_thick_profile_temp.outputs['Value'], n_thick_profile.inputs[0])
    links.new(n_thick_mid.outputs['Value'], n_thick_profile.inputs[1])

    n_z_thick = nodes.new('ShaderNodeMath')
    n_z_thick.location = (900, -1250)
    n_z_thick.operation = 'MULTIPLY'
    links.new(n_sep.outputs['Z'], n_z_thick.inputs[0])
    links.new(n_in.outputs['Thickness'], n_z_thick.inputs[1])

    n_z_taper = nodes.new('ShaderNodeMath')
    n_z_taper.location = (1100, -1250)
    n_z_taper.operation = 'MULTIPLY'
    links.new(n_z_thick.outputs['Value'], n_z_taper.inputs[0])
    links.new(n_thick_profile.outputs['Value'], n_z_taper.inputs[1])

    n_z_airfoil = nodes.new('ShaderNodeMath')
    n_z_airfoil.location = (1300, -1200)
    n_z_airfoil.operation = 'MULTIPLY'
    links.new(n_z_taper.outputs['Value'], n_z_airfoil.inputs[0])
    links.new(n_airfoil_f.outputs['Value'], n_z_airfoil.inputs[1])

    # tip edge "crush": push the surface toward the mid-plane near the tip
    n_edge_offset = nodes.new('ShaderNodeMath')
    n_edge_offset.location = (1300, -1350)
    n_edge_offset.operation = 'MULTIPLY'
    links.new(n_x_offset.outputs['Value'], n_edge_offset.inputs[0])
    links.new(n_z_airfoil.outputs['Value'], n_edge_offset.inputs[1])

    n_edge_scale = nodes.new('ShaderNodeMath')
    n_edge_scale.location = (1500, -1350)
    n_edge_scale.operation = 'MULTIPLY'
    links.new(n_edge_offset.outputs['Value'], n_edge_scale.inputs[0])
    n_edge_scale.inputs[1].default_value = 0.45

    n_new_z_flat = nodes.new('ShaderNodeMath')
    n_new_z_flat.location = (1650, -1200)
    n_new_z_flat.operation = 'SUBTRACT'
    links.new(n_z_airfoil.outputs['Value'], n_new_z_flat.inputs[0])
    links.new(n_edge_scale.outputs['Value'], n_new_z_flat.inputs[1])

    n_dih_rad = nodes.new('ShaderNodeMath')
    n_dih_rad.location = (1500, -1200)
    n_dih_rad.operation = 'RADIANS'
    links.new(n_in.outputs['Dihedral'], n_dih_rad.inputs[0])

    n_dih_tan = nodes.new('ShaderNodeMath')
    n_dih_tan.location = (1650, -1200)
    n_dih_tan.operation = 'TANGENT'
    links.new(n_dih_rad.outputs['Value'], n_dih_tan.inputs[0])

    n_dihedral_offset = nodes.new('ShaderNodeMath')
    n_dihedral_offset.location = (1800, -1200)
    n_dihedral_offset.operation = 'MULTIPLY'
    links.new(n_new_x_val.outputs['Value'], n_dihedral_offset.inputs[0])
    links.new(n_dih_tan.outputs['Value'], n_dihedral_offset.inputs[1])

    n_new_z = nodes.new('ShaderNodeMath')
    n_new_z.location = (1950, -1200)
    n_new_z.operation = 'ADD'
    links.new(n_new_z_flat.outputs['Value'], n_new_z.inputs[0])
    links.new(n_dihedral_offset.outputs['Value'], n_new_z.inputs[1])

    n_root_offset_x = nodes.new('ShaderNodeMath')
    n_root_offset_x.location = (1100, 200)
    n_root_offset_x.operation = 'ADD'
    links.new(n_new_x.outputs['Value'], n_root_offset_x.inputs[0])
    links.new(n_in.outputs['RootOffset'], n_root_offset_x.inputs[1])

    n_comb = nodes.new('ShaderNodeCombineXYZ')
    n_comb.location = (1300, 200)
    links.new(n_root_offset_x.outputs['Value'], n_comb.inputs['X'])
    links.new(n_new_y.outputs['Value'], n_comb.inputs['Y'])
    links.new(n_new_z.outputs['Value'], n_comb.inputs['Z'])

    n_setpos = nodes.new('GeometryNodeSetPosition')
    n_setpos.location = (1500, 200)
    links.new(n_cube.outputs['Mesh'], n_setpos.inputs['Geometry'])
    links.new(n_comb.outputs['Vector'], n_setpos.inputs['Position'])

    # --- twist (rotate around the span axis) ---
    n_twist_angle = nodes.new('ShaderNodeMath')
    n_twist_angle.location = (1500, 0)
    n_twist_angle.operation = 'MULTIPLY'
    links.new(n_x_offset.outputs['Value'], n_twist_angle.inputs[0])
    links.new(n_in.outputs['Twist'], n_twist_angle.inputs[1])

    n_geom_pos = nodes.new('GeometryNodeInputPosition')
    n_geom_pos.location = (1300, -50)
    n_vec_rot = nodes.new('ShaderNodeVectorRotate')
    n_vec_rot.location = (1700, 0)
    n_vec_rot.rotation_type = 'AXIS_ANGLE'
    n_vec_rot.inputs['Axis'].default_value = (1.0, 0.0, 0.0)
    links.new(n_geom_pos.outputs['Position'], n_vec_rot.inputs['Vector'])
    links.new(n_twist_angle.outputs['Value'], n_vec_rot.inputs['Angle'])

    n_settwist = nodes.new('GeometryNodeSetPosition')
    n_settwist.location = (1900, 200)
    links.new(n_setpos.outputs['Geometry'], n_settwist.inputs['Geometry'])
    links.new(n_vec_rot.outputs['Vector'], n_settwist.inputs['Position'])

    n_subdiv = nodes.new('GeometryNodeSubdivisionSurface')
    n_subdiv.location = (2100, 200)
    links.new(n_settwist.outputs['Geometry'], n_subdiv.inputs['Mesh'])
    links.new(n_in.outputs['Subdivision'], n_subdiv.inputs['Level'])

    n_shade = nodes.new('GeometryNodeSetShadeSmooth')
    n_shade.location = (2300, 200)
    n_shade.inputs['Shade Smooth'].default_value = True
    links.new(n_subdiv.outputs['Mesh'], n_shade.inputs['Geometry'])

    n_set_mat = nodes.new('GeometryNodeSetMaterial')
    n_set_mat.location = (2500, 200)
    links.new(n_shade.outputs['Geometry'], n_set_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_set_mat.inputs['Material'])
    links.new(n_set_mat.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


# ---------------------------------------------------------------------------
# ENGINES: Triple-Layer construction (Layer 1 outer rounded box with a groove
# mask, Layer 2 middle box with a sine-wave stripe displacement, Layer 3 inner
# cylinder twisted around its own axis and tapered toward ExhaustRadius at the
# nozzle end). Each layer's offset/scale is exposed as its own socket (L1/L2/L3
# _Offset[XYZ]/_Scale[XYZ]) so a generated engine stays hand-tunable per layer.
# ---------------------------------------------------------------------------

def build_engines_template():
    group = _build_weapon_group(ENGINES_TEMPLATE, (
        ('NodeSocketFloat', 'Length'), ('NodeSocketFloat', 'Radius'),
        ('NodeSocketFloat', 'ExhaustRadius'), ('NodeSocketFloat', 'Roundness'),
        ('NodeSocketFloat', 'StripeCount'), ('NodeSocketFloat', 'TwistAmount'),
        ('NodeSocketInt', 'Subdivision'),
        ('NodeSocketMaterial', 'Material'), ('NodeSocketMaterial', 'MaterialGlow'),
        ('NodeSocketFloat', 'L1_OffsetX'), ('NodeSocketFloat', 'L1_OffsetY'), ('NodeSocketFloat', 'L1_OffsetZ'),
        ('NodeSocketFloat', 'L1_ScaleX'), ('NodeSocketFloat', 'L1_ScaleY'), ('NodeSocketFloat', 'L1_ScaleZ'),
        ('NodeSocketFloat', 'L2_OffsetX'), ('NodeSocketFloat', 'L2_OffsetY'), ('NodeSocketFloat', 'L2_OffsetZ'),
        ('NodeSocketFloat', 'L2_ScaleX'), ('NodeSocketFloat', 'L2_ScaleY'), ('NodeSocketFloat', 'L2_ScaleZ'),
        ('NodeSocketFloat', 'L3_OffsetX'), ('NodeSocketFloat', 'L3_OffsetY'), ('NodeSocketFloat', 'L3_OffsetZ'),
        ('NodeSocketFloat', 'L3_ScaleX'), ('NodeSocketFloat', 'L3_ScaleY'), ('NodeSocketFloat', 'L3_ScaleZ'),
    ))
    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-2200, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (2200, 0)

    # --- Layer 1: outer rounded box with a lengthwise groove mask ---
    n_l1_cube = nodes.new('GeometryNodeMeshCube')
    n_l1_x0 = nodes.new('ShaderNodeMath')
    n_l1_x0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_l1_x0.inputs[0])
    n_l1_x0.inputs[1].default_value = 2.4
    n_l1_x = nodes.new('ShaderNodeMath')
    n_l1_x.operation = 'MULTIPLY'
    links.new(n_l1_x0.outputs['Value'], n_l1_x.inputs[0])
    links.new(n_in.outputs['L1_ScaleX'], n_l1_x.inputs[1])
    n_l1_y = nodes.new('ShaderNodeMath')
    n_l1_y.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_l1_y.inputs[0])
    links.new(n_in.outputs['L1_ScaleY'], n_l1_y.inputs[1])
    n_l1_z0 = nodes.new('ShaderNodeMath')
    n_l1_z0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_l1_z0.inputs[0])
    n_l1_z0.inputs[1].default_value = 2.0
    n_l1_z = nodes.new('ShaderNodeMath')
    n_l1_z.operation = 'MULTIPLY'
    links.new(n_l1_z0.outputs['Value'], n_l1_z.inputs[0])
    links.new(n_in.outputs['L1_ScaleZ'], n_l1_z.inputs[1])
    n_l1_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_l1_x.outputs['Value'], n_l1_size.inputs['X'])
    links.new(n_l1_y.outputs['Value'], n_l1_size.inputs['Y'])
    links.new(n_l1_z.outputs['Value'], n_l1_size.inputs['Z'])
    links.new(n_l1_size.outputs['Vector'], n_l1_cube.inputs['Size'])

    n_pos1 = nodes.new('GeometryNodeInputPosition')
    n_normal1 = nodes.new('GeometryNodeInputNormal')
    n_sep1 = nodes.new('ShaderNodeSeparateXYZ')
    links.new(n_pos1.outputs['Position'], n_sep1.inputs['Vector'])
    n_freq1 = nodes.new('ShaderNodeMath')
    n_freq1.operation = 'DIVIDE'
    n_freq1.inputs[0].default_value = 18.8495
    links.new(n_in.outputs['Length'], n_freq1.inputs[1])
    n_phase1 = nodes.new('ShaderNodeMath')
    n_phase1.operation = 'MULTIPLY'
    links.new(n_sep1.outputs['Y'], n_phase1.inputs[0])
    links.new(n_freq1.outputs['Value'], n_phase1.inputs[1])
    n_sin1 = nodes.new('ShaderNodeMath')
    n_sin1.operation = 'SINE'
    links.new(n_phase1.outputs['Value'], n_sin1.inputs[0])
    n_y_thresh = nodes.new('ShaderNodeMath')
    n_y_thresh.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_y_thresh.inputs[0])
    n_y_thresh.inputs[1].default_value = 0.15
    n_mask1 = nodes.new('ShaderNodeMath')
    n_mask1.operation = 'GREATER_THAN'
    links.new(n_sep1.outputs['Y'], n_mask1.inputs[0])
    links.new(n_y_thresh.outputs['Value'], n_mask1.inputs[1])
    n_groove_depth = nodes.new('ShaderNodeMath')
    n_groove_depth.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_groove_depth.inputs[0])
    n_groove_depth.inputs[1].default_value = -0.12
    n_g_val = nodes.new('ShaderNodeMath')
    n_g_val.operation = 'MULTIPLY'
    links.new(n_sin1.outputs['Value'], n_g_val.inputs[0])
    links.new(n_mask1.outputs['Value'], n_g_val.inputs[1])
    n_g_final = nodes.new('ShaderNodeMath')
    n_g_final.operation = 'MULTIPLY'
    links.new(n_g_val.outputs['Value'], n_g_final.inputs[0])
    links.new(n_groove_depth.outputs['Value'], n_g_final.inputs[1])
    n_g_offset = nodes.new('ShaderNodeVectorMath')
    n_g_offset.operation = 'SCALE'
    links.new(n_normal1.outputs['Normal'], n_g_offset.inputs['Vector'])
    links.new(n_g_final.outputs['Value'], n_g_offset.inputs['Scale'])
    n_l1_pos = nodes.new('GeometryNodeSetPosition')
    links.new(n_l1_cube.outputs['Mesh'], n_l1_pos.inputs['Geometry'])
    links.new(n_g_offset.outputs['Vector'], n_l1_pos.inputs['Offset'])
    n_l1_sub = nodes.new('GeometryNodeSubdivisionSurface')
    links.new(n_l1_pos.outputs['Geometry'], n_l1_sub.inputs['Mesh'])
    links.new(n_in.outputs['Subdivision'], n_l1_sub.inputs['Level'])
    n_l1_off_vec = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_in.outputs['L1_OffsetX'], n_l1_off_vec.inputs['X'])
    links.new(n_in.outputs['L1_OffsetY'], n_l1_off_vec.inputs['Y'])
    links.new(n_in.outputs['L1_OffsetZ'], n_l1_off_vec.inputs['Z'])
    n_l1_trans = nodes.new('GeometryNodeTransform')
    links.new(n_l1_sub.outputs['Mesh'], n_l1_trans.inputs['Geometry'])
    links.new(n_l1_off_vec.outputs['Vector'], n_l1_trans.inputs['Translation'])
    n_l1_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_l1_trans.outputs['Geometry'], n_l1_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_l1_mat.inputs['Material'])

    # --- Layer 2: middle box with a sine-wave stripe displacement ---
    n_l2_cube = nodes.new('GeometryNodeMeshCube')
    n_l2_x0 = nodes.new('ShaderNodeMath')
    n_l2_x0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_l2_x0.inputs[0])
    n_l2_x0.inputs[1].default_value = 1.9
    n_l2_x = nodes.new('ShaderNodeMath')
    n_l2_x.operation = 'MULTIPLY'
    links.new(n_l2_x0.outputs['Value'], n_l2_x.inputs[0])
    links.new(n_in.outputs['L2_ScaleX'], n_l2_x.inputs[1])
    n_l2_y0 = nodes.new('ShaderNodeMath')
    n_l2_y0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_l2_y0.inputs[0])
    n_l2_y0.inputs[1].default_value = 0.78
    n_l2_y = nodes.new('ShaderNodeMath')
    n_l2_y.operation = 'MULTIPLY'
    links.new(n_l2_y0.outputs['Value'], n_l2_y.inputs[0])
    links.new(n_in.outputs['L2_ScaleY'], n_l2_y.inputs[1])
    n_l2_z0 = nodes.new('ShaderNodeMath')
    n_l2_z0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_l2_z0.inputs[0])
    n_l2_z0.inputs[1].default_value = 1.6
    n_l2_z = nodes.new('ShaderNodeMath')
    n_l2_z.operation = 'MULTIPLY'
    links.new(n_l2_z0.outputs['Value'], n_l2_z.inputs[0])
    links.new(n_in.outputs['L2_ScaleZ'], n_l2_z.inputs[1])
    n_l2_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_l2_x.outputs['Value'], n_l2_size.inputs['X'])
    links.new(n_l2_y.outputs['Value'], n_l2_size.inputs['Y'])
    links.new(n_l2_z.outputs['Value'], n_l2_size.inputs['Z'])
    links.new(n_l2_size.outputs['Vector'], n_l2_cube.inputs['Size'])

    n_pos2 = nodes.new('GeometryNodeInputPosition')
    n_normal2 = nodes.new('GeometryNodeInputNormal')
    n_sep2 = nodes.new('ShaderNodeSeparateXYZ')
    links.new(n_pos2.outputs['Position'], n_sep2.inputs['Vector'])
    n_s_freq = nodes.new('ShaderNodeMath')
    n_s_freq.operation = 'MULTIPLY'
    links.new(n_in.outputs['StripeCount'], n_s_freq.inputs[0])
    n_s_freq.inputs[1].default_value = 6.28318
    n_s_scale = nodes.new('ShaderNodeMath')
    n_s_scale.operation = 'DIVIDE'
    links.new(n_s_freq.outputs['Value'], n_s_scale.inputs[0])
    links.new(n_in.outputs['Length'], n_s_scale.inputs[1])
    n_s_phase = nodes.new('ShaderNodeMath')
    n_s_phase.operation = 'MULTIPLY'
    links.new(n_sep2.outputs['Y'], n_s_phase.inputs[0])
    links.new(n_s_scale.outputs['Value'], n_s_phase.inputs[1])
    n_s_sin = nodes.new('ShaderNodeMath')
    n_s_sin.operation = 'SINE'
    links.new(n_s_phase.outputs['Value'], n_s_sin.inputs[0])
    n_s_depth = nodes.new('ShaderNodeMath')
    n_s_depth.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_s_depth.inputs[0])
    n_s_depth.inputs[1].default_value = -0.1
    n_s_final = nodes.new('ShaderNodeMath')
    n_s_final.operation = 'MULTIPLY'
    links.new(n_s_sin.outputs['Value'], n_s_final.inputs[0])
    links.new(n_s_depth.outputs['Value'], n_s_final.inputs[1])
    n_s_offset = nodes.new('ShaderNodeVectorMath')
    n_s_offset.operation = 'SCALE'
    links.new(n_normal2.outputs['Normal'], n_s_offset.inputs['Vector'])
    links.new(n_s_final.outputs['Value'], n_s_offset.inputs['Scale'])
    n_l2_pos = nodes.new('GeometryNodeSetPosition')
    links.new(n_l2_cube.outputs['Mesh'], n_l2_pos.inputs['Geometry'])
    links.new(n_s_offset.outputs['Vector'], n_l2_pos.inputs['Offset'])
    n_l2_off_vec = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_in.outputs['L2_OffsetX'], n_l2_off_vec.inputs['X'])
    links.new(n_in.outputs['L2_OffsetY'], n_l2_off_vec.inputs['Y'])
    links.new(n_in.outputs['L2_OffsetZ'], n_l2_off_vec.inputs['Z'])
    n_l2_trans = nodes.new('GeometryNodeTransform')
    links.new(n_l2_pos.outputs['Geometry'], n_l2_trans.inputs['Geometry'])
    links.new(n_l2_off_vec.outputs['Vector'], n_l2_trans.inputs['Translation'])
    n_l2_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_l2_trans.outputs['Geometry'], n_l2_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_l2_mat.inputs['Material'])

    # --- Layer 3: inner cylinder, twisted around its own axis, tapered to ExhaustRadius ---
    n_l3_cyl = nodes.new('GeometryNodeMeshCylinder')
    n_l3_cyl.inputs['Vertices'].default_value = 16
    n_l3_r0 = nodes.new('ShaderNodeMath')
    n_l3_r0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_l3_r0.inputs[0])
    n_l3_r0.inputs[1].default_value = 0.95
    n_l3_rad = nodes.new('ShaderNodeMath')
    n_l3_rad.operation = 'MULTIPLY'
    links.new(n_l3_r0.outputs['Value'], n_l3_rad.inputs[0])
    links.new(n_in.outputs['L3_ScaleX'], n_l3_rad.inputs[1])
    n_l3_d0 = nodes.new('ShaderNodeMath')
    n_l3_d0.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_l3_d0.inputs[0])
    n_l3_d0.inputs[1].default_value = 0.92
    n_l3_dep = nodes.new('ShaderNodeMath')
    n_l3_dep.operation = 'MULTIPLY'
    links.new(n_l3_d0.outputs['Value'], n_l3_dep.inputs[0])
    links.new(n_in.outputs['L3_ScaleY'], n_l3_dep.inputs[1])
    links.new(n_l3_rad.outputs['Value'], n_l3_cyl.inputs['Radius'])
    links.new(n_l3_dep.outputs['Value'], n_l3_cyl.inputs['Depth'])
    n_l3_rot = nodes.new('GeometryNodeTransform')
    n_l3_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_l3_cyl.outputs['Mesh'], n_l3_rot.inputs['Geometry'])

    n_pos3 = nodes.new('GeometryNodeInputPosition')
    n_sep3 = nodes.new('ShaderNodeSeparateXYZ')
    links.new(n_pos3.outputs['Position'], n_sep3.inputs['Vector'])
    n_t_rate = nodes.new('ShaderNodeMath')
    n_t_rate.operation = 'DIVIDE'
    links.new(n_in.outputs['TwistAmount'], n_t_rate.inputs[0])
    links.new(n_in.outputs['Length'], n_t_rate.inputs[1])
    n_t_angle = nodes.new('ShaderNodeMath')
    n_t_angle.operation = 'MULTIPLY'
    links.new(n_sep3.outputs['Y'], n_t_angle.inputs[0])
    links.new(n_t_rate.outputs['Value'], n_t_angle.inputs[1])
    n_cos = nodes.new('ShaderNodeMath')
    n_cos.operation = 'COSINE'
    links.new(n_t_angle.outputs['Value'], n_cos.inputs[0])
    n_sin = nodes.new('ShaderNodeMath')
    n_sin.operation = 'SINE'
    links.new(n_t_angle.outputs['Value'], n_sin.inputs[0])
    n_x_cos = nodes.new('ShaderNodeMath')
    n_x_cos.operation = 'MULTIPLY'
    links.new(n_sep3.outputs['X'], n_x_cos.inputs[0])
    links.new(n_cos.outputs['Value'], n_x_cos.inputs[1])
    n_z_sin = nodes.new('ShaderNodeMath')
    n_z_sin.operation = 'MULTIPLY'
    links.new(n_sep3.outputs['Z'], n_z_sin.inputs[0])
    links.new(n_sin.outputs['Value'], n_z_sin.inputs[1])
    n_new_x = nodes.new('ShaderNodeMath')
    n_new_x.operation = 'SUBTRACT'
    links.new(n_x_cos.outputs['Value'], n_new_x.inputs[0])
    links.new(n_z_sin.outputs['Value'], n_new_x.inputs[1])
    n_x_sin = nodes.new('ShaderNodeMath')
    n_x_sin.operation = 'MULTIPLY'
    links.new(n_sep3.outputs['X'], n_x_sin.inputs[0])
    links.new(n_sin.outputs['Value'], n_x_sin.inputs[1])
    n_z_cos = nodes.new('ShaderNodeMath')
    n_z_cos.operation = 'MULTIPLY'
    links.new(n_sep3.outputs['Z'], n_z_cos.inputs[0])
    links.new(n_cos.outputs['Value'], n_z_cos.inputs[1])
    n_new_z = nodes.new('ShaderNodeMath')
    n_new_z.operation = 'ADD'
    links.new(n_x_sin.outputs['Value'], n_new_z.inputs[0])
    links.new(n_z_cos.outputs['Value'], n_new_z.inputs[1])

    n_y_taper = nodes.new('ShaderNodeMapRange')
    n_y_taper.clamp = True
    n_y_half = nodes.new('ShaderNodeMath')
    n_y_half.operation = 'MULTIPLY'
    links.new(n_l3_dep.outputs['Value'], n_y_half.inputs[0])
    n_y_half.inputs[1].default_value = 0.5
    n_y_min = nodes.new('ShaderNodeMath')
    n_y_min.operation = 'MULTIPLY'
    links.new(n_y_half.outputs['Value'], n_y_min.inputs[0])
    n_y_min.inputs[1].default_value = -1.0
    links.new(n_sep3.outputs['Y'], n_y_taper.inputs['Value'])
    links.new(n_y_min.outputs['Value'], n_y_taper.inputs['From Min'])
    links.new(n_y_half.outputs['Value'], n_y_taper.inputs['From Max'])
    links.new(n_in.outputs['ExhaustRadius'], n_y_taper.inputs['To Min'])
    links.new(n_l3_rad.outputs['Value'], n_y_taper.inputs['To Max'])
    n_taper_scale = nodes.new('ShaderNodeMath')
    n_taper_scale.operation = 'DIVIDE'
    links.new(n_y_taper.outputs['Result'], n_taper_scale.inputs[0])
    links.new(n_l3_rad.outputs['Value'], n_taper_scale.inputs[1])
    n_final_x = nodes.new('ShaderNodeMath')
    n_final_x.operation = 'MULTIPLY'
    links.new(n_new_x.outputs['Value'], n_final_x.inputs[0])
    links.new(n_taper_scale.outputs['Value'], n_final_x.inputs[1])
    n_final_z = nodes.new('ShaderNodeMath')
    n_final_z.operation = 'MULTIPLY'
    links.new(n_new_z.outputs['Value'], n_final_z.inputs[0])
    links.new(n_taper_scale.outputs['Value'], n_final_z.inputs[1])
    n_l3_new_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_final_x.outputs['Value'], n_l3_new_pos.inputs['X'])
    links.new(n_sep3.outputs['Y'], n_l3_new_pos.inputs['Y'])
    links.new(n_final_z.outputs['Value'], n_l3_new_pos.inputs['Z'])
    n_l3_pos = nodes.new('GeometryNodeSetPosition')
    links.new(n_l3_rot.outputs['Geometry'], n_l3_pos.inputs['Geometry'])
    links.new(n_l3_new_pos.outputs['Vector'], n_l3_pos.inputs['Position'])
    n_l3_off_vec = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_in.outputs['L3_OffsetX'], n_l3_off_vec.inputs['X'])
    links.new(n_in.outputs['L3_OffsetY'], n_l3_off_vec.inputs['Y'])  # fixed: was mistakenly 'Z' in the recovered original
    links.new(n_in.outputs['L3_OffsetZ'], n_l3_off_vec.inputs['Z'])
    n_l3_trans = nodes.new('GeometryNodeTransform')
    links.new(n_l3_pos.outputs['Geometry'], n_l3_trans.inputs['Geometry'])
    links.new(n_l3_off_vec.outputs['Vector'], n_l3_trans.inputs['Translation'])
    n_l3_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_l3_trans.outputs['Geometry'], n_l3_mat.inputs['Geometry'])
    links.new(n_in.outputs['MaterialGlow'], n_l3_mat.inputs['Material'])

    n_join = nodes.new('GeometryNodeJoinGeometry')
    links.new(n_l1_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_l2_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_l3_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_join.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


# ---------------------------------------------------------------------------
# JET NACELLE: a plain cylindrical engine pod (deliberately simple, unlike the
# blocky/grooved ENGINES template) for mounting under a wing -- Length runs
# along local Y per the project's axis convention, radius tapers slightly
# toward the rear to read as a nozzle, and a small glow-material ring cylinder
# is joined on at the rear face for a hot-exhaust look.
# ---------------------------------------------------------------------------

def build_jet_nacelle_template():
    if NACELLE_TEMPLATE in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups[NACELLE_TEMPLATE])

    group = bpy.data.node_groups.new(NACELLE_TEMPLATE, 'GeometryNodeTree')
    group.inputs.new('NodeSocketFloat', 'Length')
    group.inputs.new('NodeSocketFloat', 'Radius')
    group.inputs.new('NodeSocketFloat', 'ExhaustRadius')
    group.inputs.new('NodeSocketInt', 'Sides')
    group.inputs.new('NodeSocketMaterial', 'Material')
    group.inputs.new('NodeSocketMaterial', 'MaterialGlow')
    group.outputs.new('NodeSocketGeometry', 'Geometry')

    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-900, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (1200, 0)

    # --- main body: a cylinder built along Z by default, rotated 90 deg around
    # X so its length axis becomes +Y (forward), matching every other part. ---
    n_body = nodes.new('GeometryNodeMeshCylinder')
    n_body.location = (-650, 150)
    n_body.fill_type = 'NGON'
    links.new(n_in.outputs['Sides'], n_body.inputs['Vertices'])
    links.new(n_in.outputs['Radius'], n_body.inputs['Radius'])
    links.new(n_in.outputs['Length'], n_body.inputs['Depth'])

    n_body_rot = nodes.new('GeometryNodeTransform')
    n_body_rot.location = (-450, 150)
    n_body_rot.inputs['Rotation'].default_value = (math.radians(-90), 0.0, 0.0)
    links.new(n_body.outputs['Mesh'], n_body_rot.inputs['Geometry'])

    # Taper the rear third of the body down to ExhaustRadius for a simple nozzle look.
    n_pos = nodes.new('GeometryNodeInputPosition')
    n_pos.location = (-650, -150)
    n_sep = nodes.new('ShaderNodeSeparateXYZ')
    n_sep.location = (-450, -150)
    links.new(n_pos.outputs['Position'], n_sep.inputs['Vector'])

    n_y_offset = nodes.new('ShaderNodeMath')  # 0 at front (-Length/2) .. 1 at rear (+Length/2)
    n_y_offset.location = (-250, -150)
    n_y_offset.operation = 'ADD'
    links.new(n_sep.outputs['Y'], n_y_offset.inputs[0])
    n_y_offset.inputs[1].default_value = 0.5

    n_y_frac = nodes.new('ShaderNodeMath')
    n_y_frac.location = (-50, -150)
    n_y_frac.operation = 'DIVIDE'
    links.new(n_y_offset.outputs['Value'], n_y_frac.inputs[0])
    links.new(n_in.outputs['Length'], n_y_frac.inputs[1])

    n_taper_ratio = nodes.new('ShaderNodeMath')  # ExhaustRadius/Radius, clamped so Radius=0 is safe
    n_taper_ratio.location = (-250, -300)
    n_taper_ratio.operation = 'DIVIDE'
    links.new(n_in.outputs['ExhaustRadius'], n_taper_ratio.inputs[0])
    n_radius_safe = nodes.new('ShaderNodeMath')
    n_radius_safe.location = (-450, -300)
    n_radius_safe.operation = 'MAXIMUM'
    links.new(n_in.outputs['Radius'], n_radius_safe.inputs[0])
    n_radius_safe.inputs[1].default_value = 0.001
    links.new(n_radius_safe.outputs['Value'], n_taper_ratio.inputs[1])

    n_scale_xz = nodes.new('ShaderNodeMapRange')  # lerp(1.0, taper_ratio, y_frac)
    n_scale_xz.location = (150, -300)
    n_scale_xz.clamp = True
    n_scale_xz.inputs['From Min'].default_value = 0.0
    n_scale_xz.inputs['From Max'].default_value = 1.0
    n_scale_xz.inputs['To Min'].default_value = 1.0
    links.new(n_y_frac.outputs['Value'], n_scale_xz.inputs['Value'])
    links.new(n_taper_ratio.outputs['Value'], n_scale_xz.inputs['To Max'])

    n_pos2 = nodes.new('GeometryNodeInputPosition')
    n_pos2.location = (150, 300)
    n_sep2 = nodes.new('ShaderNodeSeparateXYZ')
    n_sep2.location = (350, 300)
    links.new(n_pos2.outputs['Position'], n_sep2.inputs['Vector'])
    n_new_x = nodes.new('ShaderNodeMath')
    n_new_x.location = (550, 350)
    n_new_x.operation = 'MULTIPLY'
    links.new(n_sep2.outputs['X'], n_new_x.inputs[0])
    links.new(n_scale_xz.outputs['Result'], n_new_x.inputs[1])
    n_new_z = nodes.new('ShaderNodeMath')
    n_new_z.location = (550, 200)
    n_new_z.operation = 'MULTIPLY'
    links.new(n_sep2.outputs['Z'], n_new_z.inputs[0])
    links.new(n_scale_xz.outputs['Result'], n_new_z.inputs[1])
    n_comb = nodes.new('ShaderNodeCombineXYZ')
    n_comb.location = (750, 250)
    links.new(n_new_x.outputs['Value'], n_comb.inputs['X'])
    links.new(n_sep2.outputs['Y'], n_comb.inputs['Y'])
    links.new(n_new_z.outputs['Value'], n_comb.inputs['Z'])

    n_setpos = nodes.new('GeometryNodeSetPosition')
    n_setpos.location = (950, 150)
    links.new(n_body_rot.outputs['Geometry'], n_setpos.inputs['Geometry'])
    links.new(n_comb.outputs['Vector'], n_setpos.inputs['Position'])

    n_shade = nodes.new('GeometryNodeSetShadeSmooth')
    n_shade.location = (1150, 150)
    n_shade.inputs['Shade Smooth'].default_value = True
    links.new(n_setpos.outputs['Geometry'], n_shade.inputs['Geometry'])

    n_set_mat = nodes.new('GeometryNodeSetMaterial')
    n_set_mat.location = (1350, 150)
    links.new(n_shade.outputs['Geometry'], n_set_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_set_mat.inputs['Material'])

    # --- exhaust ring: a thin glowing disc flush with the rear face ---
    n_ring = nodes.new('GeometryNodeMeshCylinder')
    n_ring.location = (-650, -600)
    n_ring.fill_type = 'NGON'
    links.new(n_in.outputs['Sides'], n_ring.inputs['Vertices'])
    n_ring_radius = nodes.new('ShaderNodeMath')
    n_ring_radius.location = (-850, -650)
    n_ring_radius.operation = 'MULTIPLY'
    links.new(n_in.outputs['ExhaustRadius'], n_ring_radius.inputs[0])
    n_ring_radius.inputs[1].default_value = 0.85
    links.new(n_ring_radius.outputs['Value'], n_ring.inputs['Radius'])
    n_ring_depth = nodes.new('ShaderNodeMath')
    n_ring_depth.location = (-850, -750)
    n_ring_depth.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_ring_depth.inputs[0])
    n_ring_depth.inputs[1].default_value = 0.05
    links.new(n_ring_depth.outputs['Value'], n_ring.inputs['Depth'])

    n_ring_rot = nodes.new('GeometryNodeTransform')
    n_ring_rot.location = (-450, -600)
    n_ring_rot.inputs['Rotation'].default_value = (math.radians(-90), 0.0, 0.0)
    links.new(n_ring.outputs['Mesh'], n_ring_rot.inputs['Geometry'])

    n_ring_y = nodes.new('ShaderNodeMath')  # position at the rear face: +Length/2 minus half the ring's own depth
    n_ring_y.location = (-650, -900)
    n_ring_y.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_ring_y.inputs[0])
    n_ring_y.inputs[1].default_value = 0.47
    n_ring_translate = nodes.new('ShaderNodeCombineXYZ')
    n_ring_translate.location = (-450, -900)
    links.new(n_ring_y.outputs['Value'], n_ring_translate.inputs['Y'])

    n_ring_move = nodes.new('GeometryNodeTransform')
    n_ring_move.location = (-250, -600)
    links.new(n_ring_rot.outputs['Geometry'], n_ring_move.inputs['Geometry'])
    links.new(n_ring_translate.outputs['Vector'], n_ring_move.inputs['Translation'])

    n_ring_mat = nodes.new('GeometryNodeSetMaterial')
    n_ring_mat.location = (-50, -600)
    links.new(n_ring_move.outputs['Geometry'], n_ring_mat.inputs['Geometry'])
    links.new(n_in.outputs['MaterialGlow'], n_ring_mat.inputs['Material'])

    n_join = nodes.new('GeometryNodeJoinGeometry')
    n_join.location = (1550, 0)
    links.new(n_set_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_ring_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_join.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


# ---------------------------------------------------------------------------
# CANOPY: a UV sphere squashed/stretched into a teardrop (Teardrop pinches the
# canopy's rear taper, Stretch elongates it fore-aft).
# ---------------------------------------------------------------------------

def build_canopy_template():
    if CANOPY_TEMPLATE in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups[CANOPY_TEMPLATE])

    group = bpy.data.node_groups.new(CANOPY_TEMPLATE, 'GeometryNodeTree')
    group.inputs.new('NodeSocketFloat', 'Length')
    group.inputs.new('NodeSocketFloat', 'Width')
    group.inputs.new('NodeSocketFloat', 'Height')
    group.inputs.new('NodeSocketFloat', 'Teardrop')
    group.inputs.new('NodeSocketFloat', 'Stretch')
    group.inputs.new('NodeSocketInt', 'Subdivision')
    group.inputs.new('NodeSocketMaterial', 'Material')
    group.outputs.new('NodeSocketGeometry', 'Geometry')

    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-1000, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (1400, 0)

    n_sphere = nodes.new('GeometryNodeMeshUVSphere')
    n_sphere.location = (-800, 100)
    n_sphere.inputs['Segments'].default_value = 32
    n_sphere.inputs['Rings'].default_value = 24

    n_pos = nodes.new('GeometryNodeInputPosition')
    n_pos.location = (-800, -100)
    n_sep = nodes.new('ShaderNodeSeparateXYZ')
    n_sep.location = (-600, -100)
    links.new(n_pos.outputs['Position'], n_sep.inputs['Vector'])

    n_stretch_mul = nodes.new('ShaderNodeMath')
    n_stretch_mul.location = (-400, -150)
    n_stretch_mul.operation = 'MULTIPLY'
    links.new(n_sep.outputs['Y'], n_stretch_mul.inputs[0])
    links.new(n_in.outputs['Stretch'], n_stretch_mul.inputs[1])

    n_stretch_sub = nodes.new('ShaderNodeMath')
    n_stretch_sub.location = (-200, -150)
    n_stretch_sub.operation = 'SUBTRACT'
    n_stretch_sub.inputs[0].default_value = 1.0
    links.new(n_stretch_mul.outputs['Value'], n_stretch_sub.inputs[1])

    n_y_stretched = nodes.new('ShaderNodeMath')
    n_y_stretched.location = (0, -150)
    n_y_stretched.operation = 'MULTIPLY'
    links.new(n_sep.outputs['Y'], n_y_stretched.inputs[0])
    links.new(n_stretch_sub.outputs['Value'], n_y_stretched.inputs[1])

    n_teardrop_mul = nodes.new('ShaderNodeMath')
    n_teardrop_mul.location = (-400, -350)
    n_teardrop_mul.operation = 'MULTIPLY'
    links.new(n_sep.outputs['Y'], n_teardrop_mul.inputs[0])
    links.new(n_in.outputs['Teardrop'], n_teardrop_mul.inputs[1])

    n_scale_factor = nodes.new('ShaderNodeMath')
    n_scale_factor.location = (-200, -350)
    n_scale_factor.operation = 'SUBTRACT'
    n_scale_factor.inputs[0].default_value = 1.0
    links.new(n_teardrop_mul.outputs['Value'], n_scale_factor.inputs[1])

    n_x_scaled = nodes.new('ShaderNodeMath')
    n_x_scaled.location = (0, -300)
    n_x_scaled.operation = 'MULTIPLY'
    links.new(n_sep.outputs['X'], n_x_scaled.inputs[0])
    links.new(n_scale_factor.outputs['Value'], n_x_scaled.inputs[1])

    n_z_scaled = nodes.new('ShaderNodeMath')
    n_z_scaled.location = (0, -450)
    n_z_scaled.operation = 'MULTIPLY'
    links.new(n_sep.outputs['Z'], n_z_scaled.inputs[0])
    links.new(n_scale_factor.outputs['Value'], n_z_scaled.inputs[1])

    n_final_x = nodes.new('ShaderNodeMath')
    n_final_x.location = (250, -100)
    n_final_x.operation = 'MULTIPLY'
    links.new(n_x_scaled.outputs['Value'], n_final_x.inputs[0])
    links.new(n_in.outputs['Width'], n_final_x.inputs[1])

    n_final_y = nodes.new('ShaderNodeMath')
    n_final_y.location = (250, -250)
    n_final_y.operation = 'MULTIPLY'
    links.new(n_y_stretched.outputs['Value'], n_final_y.inputs[0])
    links.new(n_in.outputs['Length'], n_final_y.inputs[1])

    n_final_z = nodes.new('ShaderNodeMath')
    n_final_z.location = (250, -400)
    n_final_z.operation = 'MULTIPLY'
    links.new(n_z_scaled.outputs['Value'], n_final_z.inputs[0])
    links.new(n_in.outputs['Height'], n_final_z.inputs[1])

    n_comb = nodes.new('ShaderNodeCombineXYZ')
    n_comb.location = (450, -200)
    links.new(n_final_x.outputs['Value'], n_comb.inputs['X'])
    links.new(n_final_y.outputs['Value'], n_comb.inputs['Y'])
    links.new(n_final_z.outputs['Value'], n_comb.inputs['Z'])

    n_setpos = nodes.new('GeometryNodeSetPosition')
    n_setpos.location = (650, 100)
    links.new(n_sphere.outputs['Mesh'], n_setpos.inputs['Geometry'])
    links.new(n_comb.outputs['Vector'], n_setpos.inputs['Position'])

    n_subdiv = nodes.new('GeometryNodeSubdivisionSurface')
    n_subdiv.location = (850, 100)
    links.new(n_setpos.outputs['Geometry'], n_subdiv.inputs['Mesh'])
    links.new(n_in.outputs['Subdivision'], n_subdiv.inputs['Level'])

    n_set_mat = nodes.new('GeometryNodeSetMaterial')
    n_set_mat.location = (1050, 100)
    links.new(n_subdiv.outputs['Mesh'], n_set_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_set_mat.inputs['Material'])
    links.new(n_set_mat.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


# ---------------------------------------------------------------------------
# WEAPONS: a shared helper builds the node group + input sockets; each weapon
# type is boxes/cylinders transformed into place and joined. Cannon has a
# nested _make_rib() closure for the three barrel reinforcement ribs.
# ---------------------------------------------------------------------------

def _build_weapon_group(group_name, inputs_list):
    if group_name in bpy.data.node_groups:
        bpy.data.node_groups.remove(bpy.data.node_groups[group_name])
    group = bpy.data.node_groups.new(group_name, 'GeometryNodeTree')
    for sock_type, sock_name in inputs_list:
        group.inputs.new(sock_type, sock_name)
    group.outputs.new('NodeSocketGeometry', 'Geometry')
    return group


def build_cannon_template():
    """Heavy Cannon v2: Seamless barrel+receiver with gas block, power pipes,
    ribs, sensor, gear, cooling capsule."""
    group = _build_weapon_group(CANNON_TEMPLATE, (
        ('NodeSocketFloat', 'Length'), ('NodeSocketFloat', 'Radius'),
        ('NodeSocketFloat', 'BarrelLength'), ('NodeSocketFloat', 'MuzzleWidth'),
        ('NodeSocketMaterial', 'Material'),
    ))
    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-2000, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (1400, 0)

    n_blen = nodes.new('ShaderNodeMath')
    n_blen.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_blen.inputs[0])
    links.new(n_in.outputs['BarrelLength'], n_blen.inputs[1])

    n_lhalf = nodes.new('ShaderNodeMath')
    n_lhalf.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_lhalf.inputs[0])
    n_lhalf.inputs[1].default_value = 0.5

    n_bhalf = nodes.new('ShaderNodeMath')
    n_bhalf.operation = 'MULTIPLY'
    links.new(n_blen.outputs['Value'], n_bhalf.inputs[0])
    n_bhalf.inputs[1].default_value = 0.5

    n_split = nodes.new('ShaderNodeMath')
    n_split.operation = 'SUBTRACT'
    links.new(n_lhalf.outputs['Value'], n_split.inputs[0])
    links.new(n_blen.outputs['Value'], n_split.inputs[1])

    n_bctr = nodes.new('ShaderNodeMath')
    n_bctr.operation = 'ADD'
    links.new(n_split.outputs['Value'], n_bctr.inputs[0])
    links.new(n_bhalf.outputs['Value'], n_bctr.inputs[1])

    n_rlen = nodes.new('ShaderNodeMath')
    n_rlen.operation = 'SUBTRACT'
    links.new(n_in.outputs['Length'], n_rlen.inputs[0])
    links.new(n_blen.outputs['Value'], n_rlen.inputs[1])

    n_rhalf = nodes.new('ShaderNodeMath')
    n_rhalf.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_rhalf.inputs[0])
    n_rhalf.inputs[1].default_value = 0.5

    n_rctr = nodes.new('ShaderNodeMath')
    n_rctr.operation = 'SUBTRACT'
    links.new(n_split.outputs['Value'], n_rctr.inputs[0])
    links.new(n_rhalf.outputs['Value'], n_rctr.inputs[1])

    n_barrel = nodes.new('GeometryNodeMeshCylinder')
    n_barrel.inputs['Vertices'].default_value = 16
    n_bar_rad = nodes.new('ShaderNodeMath')
    n_bar_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_bar_rad.inputs[0])
    n_bar_rad.inputs[1].default_value = 0.55
    links.new(n_bar_rad.outputs['Value'], n_barrel.inputs['Radius'])
    links.new(n_blen.outputs['Value'], n_barrel.inputs['Depth'])
    n_bar_rot = nodes.new('GeometryNodeTransform')
    n_bar_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_barrel.outputs['Mesh'], n_bar_rot.inputs['Geometry'])
    n_bar_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_bctr.outputs['Value'], n_bar_pos.inputs['Y'])
    n_bar_trans = nodes.new('GeometryNodeTransform')
    links.new(n_bar_rot.outputs['Geometry'], n_bar_trans.inputs['Geometry'])
    links.new(n_bar_pos.outputs['Vector'], n_bar_trans.inputs['Translation'])

    n_muz = nodes.new('GeometryNodeMeshCylinder')
    n_muz.inputs['Vertices'].default_value = 16
    n_muz_rad = nodes.new('ShaderNodeMath')
    n_muz_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_muz_rad.inputs[0])
    links.new(n_in.outputs['MuzzleWidth'], n_muz_rad.inputs[1])
    n_muz_dep = nodes.new('ShaderNodeMath')
    n_muz_dep.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_muz_dep.inputs[0])
    n_muz_dep.inputs[1].default_value = 0.45
    links.new(n_muz_rad.outputs['Value'], n_muz.inputs['Radius'])
    links.new(n_muz_dep.outputs['Value'], n_muz.inputs['Depth'])
    n_muz_rot = nodes.new('GeometryNodeTransform')
    n_muz_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_muz.outputs['Mesh'], n_muz_rot.inputs['Geometry'])
    n_muz_dhalf = nodes.new('ShaderNodeMath')
    n_muz_dhalf.operation = 'MULTIPLY'
    links.new(n_muz_dep.outputs['Value'], n_muz_dhalf.inputs[0])
    n_muz_dhalf.inputs[1].default_value = 0.5
    n_muz_cy = nodes.new('ShaderNodeMath')
    n_muz_cy.operation = 'SUBTRACT'
    links.new(n_lhalf.outputs['Value'], n_muz_cy.inputs[0])
    links.new(n_muz_dhalf.outputs['Value'], n_muz_cy.inputs[1])
    n_muz_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_muz_cy.outputs['Value'], n_muz_pos.inputs['Y'])
    n_muz_trans = nodes.new('GeometryNodeTransform')
    links.new(n_muz_rot.outputs['Geometry'], n_muz_trans.inputs['Geometry'])
    links.new(n_muz_pos.outputs['Vector'], n_muz_trans.inputs['Translation'])

    n_gas = nodes.new('GeometryNodeMeshCylinder')
    n_gas.inputs['Vertices'].default_value = 16
    n_gas_rad = nodes.new('ShaderNodeMath')
    n_gas_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_gas_rad.inputs[0])
    n_gas_rad.inputs[1].default_value = 0.9
    n_gas_dep = nodes.new('ShaderNodeMath')
    n_gas_dep.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_gas_dep.inputs[0])
    n_gas_dep.inputs[1].default_value = 0.45
    links.new(n_gas_rad.outputs['Value'], n_gas.inputs['Radius'])
    links.new(n_gas_dep.outputs['Value'], n_gas.inputs['Depth'])
    n_gas_rot = nodes.new('GeometryNodeTransform')
    n_gas_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_gas.outputs['Mesh'], n_gas_rot.inputs['Geometry'])
    n_gas_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_split.outputs['Value'], n_gas_pos.inputs['Y'])
    n_gas_trans = nodes.new('GeometryNodeTransform')
    links.new(n_gas_rot.outputs['Geometry'], n_gas_trans.inputs['Geometry'])
    links.new(n_gas_pos.outputs['Vector'], n_gas_trans.inputs['Translation'])

    n_recv = nodes.new('GeometryNodeMeshCube')
    n_recv_x = nodes.new('ShaderNodeMath')
    n_recv_x.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_recv_x.inputs[0])
    n_recv_x.inputs[1].default_value = 2.8
    n_recv_z = nodes.new('ShaderNodeMath')
    n_recv_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_recv_z.inputs[0])
    n_recv_z.inputs[1].default_value = 2.2
    n_recv_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_recv_x.outputs['Value'], n_recv_size.inputs['X'])
    links.new(n_rlen.outputs['Value'], n_recv_size.inputs['Y'])
    links.new(n_recv_z.outputs['Value'], n_recv_size.inputs['Z'])
    links.new(n_recv_size.outputs['Vector'], n_recv.inputs['Size'])
    n_recv_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rctr.outputs['Value'], n_recv_pos.inputs['Y'])
    n_recv_trans = nodes.new('GeometryNodeTransform')
    links.new(n_recv.outputs['Mesh'], n_recv_trans.inputs['Geometry'])
    links.new(n_recv_pos.outputs['Vector'], n_recv_trans.inputs['Translation'])

    n_rail = nodes.new('GeometryNodeMeshCube')
    n_rail_x = nodes.new('ShaderNodeMath')
    n_rail_x.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rail_x.inputs[0])
    n_rail_x.inputs[1].default_value = 0.55
    n_rail_ylen = nodes.new('ShaderNodeMath')
    n_rail_ylen.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_rail_ylen.inputs[0])
    n_rail_ylen.inputs[1].default_value = 0.75
    n_rail_z = nodes.new('ShaderNodeMath')
    n_rail_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rail_z.inputs[0])
    n_rail_z.inputs[1].default_value = 0.28
    n_rail_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rail_x.outputs['Value'], n_rail_size.inputs['X'])
    links.new(n_rail_ylen.outputs['Value'], n_rail_size.inputs['Y'])
    links.new(n_rail_z.outputs['Value'], n_rail_size.inputs['Z'])
    links.new(n_rail_size.outputs['Vector'], n_rail.inputs['Size'])
    n_rail_zoff = nodes.new('ShaderNodeMath')
    n_rail_zoff.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rail_zoff.inputs[0])
    n_rail_zoff.inputs[1].default_value = 1.24
    n_rail_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rctr.outputs['Value'], n_rail_pos.inputs['Y'])
    links.new(n_rail_zoff.outputs['Value'], n_rail_pos.inputs['Z'])
    n_rail_trans = nodes.new('GeometryNodeTransform')
    links.new(n_rail.outputs['Mesh'], n_rail_trans.inputs['Geometry'])
    links.new(n_rail_pos.outputs['Vector'], n_rail_trans.inputs['Translation'])

    n_sens = nodes.new('GeometryNodeMeshCube')
    n_sens_xy = nodes.new('ShaderNodeMath')
    n_sens_xy.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_sens_xy.inputs[0])
    n_sens_xy.inputs[1].default_value = 0.65
    n_sens_z = nodes.new('ShaderNodeMath')
    n_sens_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_sens_z.inputs[0])
    n_sens_z.inputs[1].default_value = 0.55
    n_sens_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_sens_xy.outputs['Value'], n_sens_size.inputs['X'])
    links.new(n_sens_xy.outputs['Value'], n_sens_size.inputs['Y'])
    links.new(n_sens_z.outputs['Value'], n_sens_size.inputs['Z'])
    links.new(n_sens_size.outputs['Vector'], n_sens.inputs['Size'])
    n_sens_yoff = nodes.new('ShaderNodeMath')
    n_sens_yoff.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_sens_yoff.inputs[0])
    n_sens_yoff.inputs[1].default_value = -0.18
    n_sens_cy = nodes.new('ShaderNodeMath')
    n_sens_cy.operation = 'ADD'
    links.new(n_split.outputs['Value'], n_sens_cy.inputs[0])
    links.new(n_sens_yoff.outputs['Value'], n_sens_cy.inputs[1])
    n_sens_zoff = nodes.new('ShaderNodeMath')
    n_sens_zoff.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_sens_zoff.inputs[0])
    n_sens_zoff.inputs[1].default_value = 1.65
    n_sens_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_sens_cy.outputs['Value'], n_sens_pos.inputs['Y'])
    links.new(n_sens_zoff.outputs['Value'], n_sens_pos.inputs['Z'])
    n_sens_trans = nodes.new('GeometryNodeTransform')
    links.new(n_sens.outputs['Mesh'], n_sens_trans.inputs['Geometry'])
    links.new(n_sens_pos.outputs['Vector'], n_sens_trans.inputs['Translation'])

    n_buf = nodes.new('GeometryNodeMeshCylinder')
    n_buf.inputs['Vertices'].default_value = 12
    n_buf_rad = nodes.new('ShaderNodeMath')
    n_buf_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_buf_rad.inputs[0])
    n_buf_rad.inputs[1].default_value = 0.62
    n_buf_dep = nodes.new('ShaderNodeMath')
    n_buf_dep.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_buf_dep.inputs[0])
    n_buf_dep.inputs[1].default_value = 0.5
    links.new(n_buf_rad.outputs['Value'], n_buf.inputs['Radius'])
    links.new(n_buf_dep.outputs['Value'], n_buf.inputs['Depth'])
    n_buf_rot = nodes.new('GeometryNodeTransform')
    n_buf_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_buf.outputs['Mesh'], n_buf_rot.inputs['Geometry'])
    n_buf_z = nodes.new('ShaderNodeMath')
    n_buf_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_buf_z.inputs[0])
    n_buf_z.inputs[1].default_value = -0.42
    n_buf_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rctr.outputs['Value'], n_buf_pos.inputs['Y'])
    links.new(n_buf_z.outputs['Value'], n_buf_pos.inputs['Z'])
    n_buf_trans = nodes.new('GeometryNodeTransform')
    links.new(n_buf_rot.outputs['Geometry'], n_buf_trans.inputs['Geometry'])
    links.new(n_buf_pos.outputs['Vector'], n_buf_trans.inputs['Translation'])

    n_pipe_l = nodes.new('GeometryNodeMeshCylinder')
    n_pipe_l.inputs['Vertices'].default_value = 8
    n_pipe_rad = nodes.new('ShaderNodeMath')
    n_pipe_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_pipe_rad.inputs[0])
    n_pipe_rad.inputs[1].default_value = 0.16
    links.new(n_pipe_rad.outputs['Value'], n_pipe_l.inputs['Radius'])
    links.new(n_blen.outputs['Value'], n_pipe_l.inputs['Depth'])
    n_pipe_rot = nodes.new('GeometryNodeTransform')
    n_pipe_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_pipe_l.outputs['Mesh'], n_pipe_rot.inputs['Geometry'])
    n_pipe_xl = nodes.new('ShaderNodeMath')
    n_pipe_xl.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_pipe_xl.inputs[0])
    n_pipe_xl.inputs[1].default_value = -0.68
    n_pipe_z = nodes.new('ShaderNodeMath')
    n_pipe_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_pipe_z.inputs[0])
    n_pipe_z.inputs[1].default_value = -0.62
    n_pipe_pos_l = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_pipe_xl.outputs['Value'], n_pipe_pos_l.inputs['X'])
    links.new(n_bctr.outputs['Value'], n_pipe_pos_l.inputs['Y'])
    links.new(n_pipe_z.outputs['Value'], n_pipe_pos_l.inputs['Z'])
    n_pipe_trans_l = nodes.new('GeometryNodeTransform')
    links.new(n_pipe_rot.outputs['Geometry'], n_pipe_trans_l.inputs['Geometry'])
    links.new(n_pipe_pos_l.outputs['Vector'], n_pipe_trans_l.inputs['Translation'])

    n_pipe_r = nodes.new('GeometryNodeMeshCylinder')
    n_pipe_r.inputs['Vertices'].default_value = 8
    links.new(n_pipe_rad.outputs['Value'], n_pipe_r.inputs['Radius'])
    links.new(n_blen.outputs['Value'], n_pipe_r.inputs['Depth'])
    n_pipe_rot_r = nodes.new('GeometryNodeTransform')
    n_pipe_rot_r.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_pipe_r.outputs['Mesh'], n_pipe_rot_r.inputs['Geometry'])
    n_pipe_xr = nodes.new('ShaderNodeMath')
    n_pipe_xr.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_pipe_xr.inputs[0])
    n_pipe_xr.inputs[1].default_value = 0.68
    n_pipe_pos_r = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_pipe_xr.outputs['Value'], n_pipe_pos_r.inputs['X'])
    links.new(n_bctr.outputs['Value'], n_pipe_pos_r.inputs['Y'])
    links.new(n_pipe_z.outputs['Value'], n_pipe_pos_r.inputs['Z'])
    n_pipe_trans_r = nodes.new('GeometryNodeTransform')
    links.new(n_pipe_rot_r.outputs['Geometry'], n_pipe_trans_r.inputs['Geometry'])
    links.new(n_pipe_pos_r.outputs['Vector'], n_pipe_trans_r.inputs['Translation'])

    n_rib_rad = nodes.new('ShaderNodeMath')
    n_rib_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rib_rad.inputs[0])
    n_rib_rad.inputs[1].default_value = 0.8
    n_rib_dep = nodes.new('ShaderNodeMath')
    n_rib_dep.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rib_dep.inputs[0])
    n_rib_dep.inputs[1].default_value = 0.18

    def _make_rib(t_ratio):
        n_r = nodes.new('GeometryNodeMeshCylinder')
        n_r.inputs['Vertices'].default_value = 16
        links.new(n_rib_rad.outputs['Value'], n_r.inputs['Radius'])
        links.new(n_rib_dep.outputs['Value'], n_r.inputs['Depth'])
        n_rot = nodes.new('GeometryNodeTransform')
        n_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
        links.new(n_r.outputs['Mesh'], n_rot.inputs['Geometry'])
        n_off = nodes.new('ShaderNodeMath')
        n_off.operation = 'MULTIPLY'
        links.new(n_blen.outputs['Value'], n_off.inputs[0])
        n_off.inputs[1].default_value = t_ratio
        n_cy = nodes.new('ShaderNodeMath')
        n_cy.operation = 'ADD'
        links.new(n_split.outputs['Value'], n_cy.inputs[0])
        links.new(n_off.outputs['Value'], n_cy.inputs[1])
        n_pos = nodes.new('ShaderNodeCombineXYZ')
        links.new(n_cy.outputs['Value'], n_pos.inputs['Y'])
        n_tr = nodes.new('GeometryNodeTransform')
        links.new(n_rot.outputs['Geometry'], n_tr.inputs['Geometry'])
        links.new(n_pos.outputs['Vector'], n_tr.inputs['Translation'])
        return n_tr

    n_rib1_trans = _make_rib(0.22)
    n_rib2_trans = _make_rib(0.5)
    n_rib3_trans = _make_rib(0.78)

    n_eject = nodes.new('GeometryNodeMeshCube')
    n_ej_x = nodes.new('ShaderNodeMath')
    n_ej_x.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_ej_x.inputs[0])
    n_ej_x.inputs[1].default_value = 0.38
    n_ej_ylen = nodes.new('ShaderNodeMath')
    n_ej_ylen.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_ej_ylen.inputs[0])
    n_ej_ylen.inputs[1].default_value = 0.32
    n_ej_z = nodes.new('ShaderNodeMath')
    n_ej_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_ej_z.inputs[0])
    n_ej_z.inputs[1].default_value = 0.85
    n_ej_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_ej_x.outputs['Value'], n_ej_size.inputs['X'])
    links.new(n_ej_ylen.outputs['Value'], n_ej_size.inputs['Y'])
    links.new(n_ej_z.outputs['Value'], n_ej_size.inputs['Z'])
    links.new(n_ej_size.outputs['Vector'], n_eject.inputs['Size'])
    n_ej_xoff = nodes.new('ShaderNodeMath')
    n_ej_xoff.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_ej_xoff.inputs[0])
    n_ej_xoff.inputs[1].default_value = 1.6
    n_ej_yoff = nodes.new('ShaderNodeMath')
    n_ej_yoff.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_ej_yoff.inputs[0])
    n_ej_yoff.inputs[1].default_value = -0.22
    n_ej_cy = nodes.new('ShaderNodeMath')
    n_ej_cy.operation = 'ADD'
    links.new(n_split.outputs['Value'], n_ej_cy.inputs[0])
    links.new(n_ej_yoff.outputs['Value'], n_ej_cy.inputs[1])
    n_ej_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_ej_xoff.outputs['Value'], n_ej_pos.inputs['X'])
    links.new(n_ej_cy.outputs['Value'], n_ej_pos.inputs['Y'])
    n_eject_trans = nodes.new('GeometryNodeTransform')
    links.new(n_eject.outputs['Mesh'], n_eject_trans.inputs['Geometry'])
    links.new(n_ej_pos.outputs['Vector'], n_eject_trans.inputs['Translation'])

    n_gear = nodes.new('GeometryNodeMeshCylinder')
    n_gear.inputs['Vertices'].default_value = 10
    n_gear_rad = nodes.new('ShaderNodeMath')
    n_gear_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_gear_rad.inputs[0])
    n_gear_rad.inputs[1].default_value = 0.52
    n_gear_dep = nodes.new('ShaderNodeMath')
    n_gear_dep.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_gear_dep.inputs[0])
    n_gear_dep.inputs[1].default_value = 0.28
    links.new(n_gear_rad.outputs['Value'], n_gear.inputs['Radius'])
    links.new(n_gear_dep.outputs['Value'], n_gear.inputs['Depth'])
    n_gear_xoff = nodes.new('ShaderNodeMath')
    n_gear_xoff.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_gear_xoff.inputs[0])
    n_gear_xoff.inputs[1].default_value = -1.62
    n_gear_yoff = nodes.new('ShaderNodeMath')
    n_gear_yoff.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_gear_yoff.inputs[0])
    n_gear_yoff.inputs[1].default_value = -0.45
    n_gear_cy = nodes.new('ShaderNodeMath')
    n_gear_cy.operation = 'ADD'
    links.new(n_split.outputs['Value'], n_gear_cy.inputs[0])
    links.new(n_gear_yoff.outputs['Value'], n_gear_cy.inputs[1])
    n_gear_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_gear_xoff.outputs['Value'], n_gear_pos.inputs['X'])
    links.new(n_gear_cy.outputs['Value'], n_gear_pos.inputs['Y'])
    n_gear_trans = nodes.new('GeometryNodeTransform')
    n_gear_trans.inputs['Rotation'].default_value = (0, math.radians(90), 0)
    links.new(n_gear.outputs['Mesh'], n_gear_trans.inputs['Geometry'])
    links.new(n_gear_pos.outputs['Vector'], n_gear_trans.inputs['Translation'])

    n_cool = nodes.new('GeometryNodeMeshCylinder')
    n_cool.inputs['Vertices'].default_value = 12
    n_cool_rad = nodes.new('ShaderNodeMath')
    n_cool_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_cool_rad.inputs[0])
    n_cool_rad.inputs[1].default_value = 0.42
    n_cool_dep = nodes.new('ShaderNodeMath')
    n_cool_dep.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_cool_dep.inputs[0])
    n_cool_dep.inputs[1].default_value = 0.38
    links.new(n_cool_rad.outputs['Value'], n_cool.inputs['Radius'])
    links.new(n_cool_dep.outputs['Value'], n_cool.inputs['Depth'])
    n_cool_rot = nodes.new('GeometryNodeTransform')
    n_cool_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_cool.outputs['Mesh'], n_cool_rot.inputs['Geometry'])
    n_cool_yoff = nodes.new('ShaderNodeMath')
    n_cool_yoff.operation = 'MULTIPLY'
    links.new(n_rlen.outputs['Value'], n_cool_yoff.inputs[0])
    n_cool_yoff.inputs[1].default_value = -0.19
    n_cool_cy = nodes.new('ShaderNodeMath')
    n_cool_cy.operation = 'ADD'
    links.new(n_split.outputs['Value'], n_cool_cy.inputs[0])
    links.new(n_cool_yoff.outputs['Value'], n_cool_cy.inputs[1])
    n_cool_z = nodes.new('ShaderNodeMath')
    n_cool_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_cool_z.inputs[0])
    n_cool_z.inputs[1].default_value = -1.12
    n_cool_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_cool_cy.outputs['Value'], n_cool_pos.inputs['Y'])
    links.new(n_cool_z.outputs['Value'], n_cool_pos.inputs['Z'])
    n_cool_trans = nodes.new('GeometryNodeTransform')
    links.new(n_cool_rot.outputs['Geometry'], n_cool_trans.inputs['Geometry'])
    links.new(n_cool_pos.outputs['Vector'], n_cool_trans.inputs['Translation'])

    n_join = nodes.new('GeometryNodeJoinGeometry')
    for t in (n_bar_trans, n_muz_trans, n_gas_trans, n_recv_trans, n_rail_trans,
              n_sens_trans, n_buf_trans, n_pipe_trans_l, n_pipe_trans_r,
              n_rib1_trans, n_rib2_trans, n_rib3_trans, n_eject_trans,
              n_gear_trans, n_cool_trans):
        links.new(t.outputs['Geometry'], n_join.inputs['Geometry'])

    n_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_join.outputs['Geometry'], n_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_mat.inputs['Material'])
    links.new(n_mat.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


def build_gatling_template():
    """Machine Gun / Gatling: receiver box + feed cover + shroud + exposed barrel."""
    group = _build_weapon_group(GATLING_TEMPLATE, (
        ('NodeSocketFloat', 'Length'), ('NodeSocketFloat', 'Radius'),
        ('NodeSocketFloat', 'BarrelLength'), ('NodeSocketMaterial', 'Material'),
    ))
    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-1200, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (800, 0)

    n_recv = nodes.new('GeometryNodeMeshCube')
    n_rx = nodes.new('ShaderNodeMath')
    n_rx.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rx.inputs[0])
    n_rx.inputs[1].default_value = 2.0
    n_ry = nodes.new('ShaderNodeMath')
    n_ry.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_ry.inputs[0])
    n_ry.inputs[1].default_value = 0.35
    n_rz = nodes.new('ShaderNodeMath')
    n_rz.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rz.inputs[0])
    n_rz.inputs[1].default_value = 2.6
    n_rsize = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rx.outputs['Value'], n_rsize.inputs['X'])
    links.new(n_ry.outputs['Value'], n_rsize.inputs['Y'])
    links.new(n_rz.outputs['Value'], n_rsize.inputs['Z'])
    links.new(n_rsize.outputs['Vector'], n_recv.inputs['Size'])

    n_feed = nodes.new('GeometryNodeMeshCube')
    n_fx = nodes.new('ShaderNodeMath')
    n_fx.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_fx.inputs[0])
    n_fx.inputs[1].default_value = 2.6
    n_fy = nodes.new('ShaderNodeMath')
    n_fy.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_fy.inputs[0])
    n_fy.inputs[1].default_value = 0.2
    n_fz = nodes.new('ShaderNodeMath')
    n_fz.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_fz.inputs[0])
    n_fz.inputs[1].default_value = 0.8
    n_fsize = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_fx.outputs['Value'], n_fsize.inputs['X'])
    links.new(n_fy.outputs['Value'], n_fsize.inputs['Y'])
    links.new(n_fz.outputs['Value'], n_fsize.inputs['Z'])
    links.new(n_fsize.outputs['Vector'], n_feed.inputs['Size'])
    n_fpz = nodes.new('ShaderNodeMath')
    n_fpz.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_fpz.inputs[0])
    n_fpz.inputs[1].default_value = 1.3
    n_fpos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_fpz.outputs['Value'], n_fpos.inputs['Z'])
    n_ftrans = nodes.new('GeometryNodeTransform')
    links.new(n_feed.outputs['Mesh'], n_ftrans.inputs['Geometry'])
    links.new(n_fpos.outputs['Vector'], n_ftrans.inputs['Translation'])

    n_box_join = nodes.new('GeometryNodeJoinGeometry')
    links.new(n_recv.outputs['Mesh'], n_box_join.inputs['Geometry'])
    links.new(n_ftrans.outputs['Geometry'], n_box_join.inputs['Geometry'])
    n_box_py = nodes.new('ShaderNodeMath')
    n_box_py.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_box_py.inputs[0])
    n_box_py.inputs[1].default_value = -0.325
    n_box_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_box_py.outputs['Value'], n_box_pos.inputs['Y'])
    n_box_trans = nodes.new('GeometryNodeTransform')
    links.new(n_box_join.outputs['Geometry'], n_box_trans.inputs['Geometry'])
    links.new(n_box_pos.outputs['Vector'], n_box_trans.inputs['Translation'])

    n_sh = nodes.new('GeometryNodeMeshCylinder')
    n_sh.inputs['Vertices'].default_value = 12
    n_sh_rad = nodes.new('ShaderNodeMath')
    n_sh_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_sh_rad.inputs[0])
    n_sh_rad.inputs[1].default_value = 1.15
    n_sh_len = nodes.new('ShaderNodeMath')
    n_sh_len.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_sh_len.inputs[0])
    n_sh_len.inputs[1].default_value = 0.35
    links.new(n_sh_rad.outputs['Value'], n_sh.inputs['Radius'])
    links.new(n_sh_len.outputs['Value'], n_sh.inputs['Depth'])
    n_sh_rot = nodes.new('GeometryNodeTransform')
    n_sh_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_sh.outputs['Mesh'], n_sh_rot.inputs['Geometry'])
    n_sh_py = nodes.new('ShaderNodeMath')
    n_sh_py.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_sh_py.inputs[0])
    n_sh_py.inputs[1].default_value = -0.05
    n_sh_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_sh_py.outputs['Value'], n_sh_pos.inputs['Y'])
    n_sh_trans = nodes.new('GeometryNodeTransform')
    links.new(n_sh_rot.outputs['Geometry'], n_sh_trans.inputs['Geometry'])
    links.new(n_sh_pos.outputs['Vector'], n_sh_trans.inputs['Translation'])

    n_barrel = nodes.new('GeometryNodeMeshCylinder')
    n_barrel.inputs['Vertices'].default_value = 12
    n_bar_rad = nodes.new('ShaderNodeMath')
    n_bar_rad.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_bar_rad.inputs[0])
    n_bar_rad.inputs[1].default_value = 0.38
    n_bar_len = nodes.new('ShaderNodeMath')
    n_bar_len.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_bar_len.inputs[0])
    links.new(n_in.outputs['BarrelLength'], n_bar_len.inputs[1])
    links.new(n_bar_rad.outputs['Value'], n_barrel.inputs['Radius'])
    links.new(n_bar_len.outputs['Value'], n_barrel.inputs['Depth'])
    n_bar_rot = nodes.new('GeometryNodeTransform')
    n_bar_rot.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
    links.new(n_barrel.outputs['Mesh'], n_bar_rot.inputs['Geometry'])
    n_bar_y1 = nodes.new('ShaderNodeMath')
    n_bar_y1.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_bar_y1.inputs[0])
    n_bar_y1.inputs[1].default_value = -0.15
    n_bar_y2 = nodes.new('ShaderNodeMath')
    n_bar_y2.operation = 'DIVIDE'
    links.new(n_bar_len.outputs['Value'], n_bar_y2.inputs[0])
    n_bar_y2.inputs[1].default_value = 2.0
    n_bar_y = nodes.new('ShaderNodeMath')
    n_bar_y.operation = 'ADD'
    links.new(n_bar_y1.outputs['Value'], n_bar_y.inputs[0])
    links.new(n_bar_y2.outputs['Value'], n_bar_y.inputs[1])
    n_bar_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_bar_y.outputs['Value'], n_bar_pos.inputs['Y'])
    n_bar_trans = nodes.new('GeometryNodeTransform')
    links.new(n_bar_rot.outputs['Geometry'], n_bar_trans.inputs['Geometry'])
    links.new(n_bar_pos.outputs['Vector'], n_bar_trans.inputs['Translation'])

    n_join = nodes.new('GeometryNodeJoinGeometry')
    links.new(n_box_trans.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_sh_trans.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_bar_trans.outputs['Geometry'], n_join.inputs['Geometry'])
    n_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_join.outputs['Geometry'], n_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_mat.inputs['Material'])
    links.new(n_mat.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


def build_railgun_template():
    """Railgun: energy breach + dual acceleration rails + glowing plasma core."""
    group = _build_weapon_group(RAILGUN_TEMPLATE, (
        ('NodeSocketFloat', 'Length'), ('NodeSocketFloat', 'Radius'),
        ('NodeSocketFloat', 'BarrelLength'), ('NodeSocketMaterial', 'Material'),
        ('NodeSocketMaterial', 'MaterialGlow'),
    ))
    nodes = group.nodes
    links = group.links
    nodes.clear()

    n_in = nodes.new('NodeGroupInput')
    n_in.location = (-1200, 0)
    n_out = nodes.new('NodeGroupOutput')
    n_out.location = (800, 0)

    n_breach = nodes.new('GeometryNodeMeshCube')
    n_bx = nodes.new('ShaderNodeMath')
    n_bx.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_bx.inputs[0])
    n_bx.inputs[1].default_value = 3.2
    n_by = nodes.new('ShaderNodeMath')
    n_by.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_by.inputs[0])
    n_by.inputs[1].default_value = 0.28
    n_bz = nodes.new('ShaderNodeMath')
    n_bz.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_bz.inputs[0])
    n_bz.inputs[1].default_value = 3.5
    n_bsize = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_bx.outputs['Value'], n_bsize.inputs['X'])
    links.new(n_by.outputs['Value'], n_bsize.inputs['Y'])
    links.new(n_bz.outputs['Value'], n_bsize.inputs['Z'])
    links.new(n_bsize.outputs['Vector'], n_breach.inputs['Size'])
    n_b_py = nodes.new('ShaderNodeMath')
    n_b_py.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_b_py.inputs[0])
    n_b_py.inputs[1].default_value = -0.36
    n_b_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_b_py.outputs['Value'], n_b_pos.inputs['Y'])
    n_b_trans = nodes.new('GeometryNodeTransform')
    links.new(n_breach.outputs['Mesh'], n_b_trans.inputs['Geometry'])
    links.new(n_b_pos.outputs['Vector'], n_b_trans.inputs['Translation'])

    n_rail = nodes.new('GeometryNodeMeshCube')
    n_rl_x = nodes.new('ShaderNodeMath')
    n_rl_x.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rl_x.inputs[0])
    n_rl_x.inputs[1].default_value = 0.8
    n_rl_y = nodes.new('ShaderNodeMath')
    n_rl_y.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_rl_y.inputs[0])
    links.new(n_in.outputs['BarrelLength'], n_rl_y.inputs[1])
    n_rl_z = nodes.new('ShaderNodeMath')
    n_rl_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rl_z.inputs[0])
    n_rl_z.inputs[1].default_value = 2.4
    n_rl_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rl_x.outputs['Value'], n_rl_size.inputs['X'])
    links.new(n_rl_y.outputs['Value'], n_rl_size.inputs['Y'])
    links.new(n_rl_z.outputs['Value'], n_rl_size.inputs['Z'])
    links.new(n_rl_size.outputs['Vector'], n_rail.inputs['Size'])
    n_rl_py1 = nodes.new('ShaderNodeMath')
    n_rl_py1.operation = 'MULTIPLY'
    links.new(n_in.outputs['Length'], n_rl_py1.inputs[0])
    n_rl_py1.inputs[1].default_value = -0.22
    n_rl_py2 = nodes.new('ShaderNodeMath')
    n_rl_py2.operation = 'DIVIDE'
    links.new(n_rl_y.outputs['Value'], n_rl_py2.inputs[0])
    n_rl_py2.inputs[1].default_value = 2.0
    n_rl_py = nodes.new('ShaderNodeMath')
    n_rl_py.operation = 'ADD'
    links.new(n_rl_py1.outputs['Value'], n_rl_py.inputs[0])
    links.new(n_rl_py2.outputs['Value'], n_rl_py.inputs[1])
    n_rl_lx = nodes.new('ShaderNodeMath')
    n_rl_lx.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rl_lx.inputs[0])
    n_rl_lx.inputs[1].default_value = -0.9
    n_rl_l_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rl_lx.outputs['Value'], n_rl_l_pos.inputs['X'])
    links.new(n_rl_py.outputs['Value'], n_rl_l_pos.inputs['Y'])
    n_rl_l_trans = nodes.new('GeometryNodeTransform')
    links.new(n_rail.outputs['Mesh'], n_rl_l_trans.inputs['Geometry'])
    links.new(n_rl_l_pos.outputs['Vector'], n_rl_l_trans.inputs['Translation'])
    n_rl_rx = nodes.new('ShaderNodeMath')
    n_rl_rx.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_rl_rx.inputs[0])
    n_rl_rx.inputs[1].default_value = 0.9
    n_rl_r_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rl_rx.outputs['Value'], n_rl_r_pos.inputs['X'])
    links.new(n_rl_py.outputs['Value'], n_rl_r_pos.inputs['Y'])
    n_rl_r_trans = nodes.new('GeometryNodeTransform')
    links.new(n_rail.outputs['Mesh'], n_rl_r_trans.inputs['Geometry'])
    links.new(n_rl_r_pos.outputs['Vector'], n_rl_r_trans.inputs['Translation'])

    n_core = nodes.new('GeometryNodeMeshCube')
    n_core_x = nodes.new('ShaderNodeMath')
    n_core_x.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_core_x.inputs[0])
    n_core_x.inputs[1].default_value = 0.6
    n_core_z = nodes.new('ShaderNodeMath')
    n_core_z.operation = 'MULTIPLY'
    links.new(n_in.outputs['Radius'], n_core_z.inputs[0])
    n_core_z.inputs[1].default_value = 0.8
    n_core_size = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_core_x.outputs['Value'], n_core_size.inputs['X'])
    links.new(n_rl_y.outputs['Value'], n_core_size.inputs['Y'])
    links.new(n_core_z.outputs['Value'], n_core_size.inputs['Z'])
    links.new(n_core_size.outputs['Vector'], n_core.inputs['Size'])
    n_core_pos = nodes.new('ShaderNodeCombineXYZ')
    links.new(n_rl_py.outputs['Value'], n_core_pos.inputs['Y'])
    n_core_trans = nodes.new('GeometryNodeTransform')
    links.new(n_core.outputs['Mesh'], n_core_trans.inputs['Geometry'])
    links.new(n_core_pos.outputs['Vector'], n_core_trans.inputs['Translation'])
    n_core_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_core_trans.outputs['Geometry'], n_core_mat.inputs['Geometry'])
    links.new(n_in.outputs['MaterialGlow'], n_core_mat.inputs['Material'])

    n_metal_join = nodes.new('GeometryNodeJoinGeometry')
    links.new(n_b_trans.outputs['Geometry'], n_metal_join.inputs['Geometry'])
    links.new(n_rl_l_trans.outputs['Geometry'], n_metal_join.inputs['Geometry'])
    links.new(n_rl_r_trans.outputs['Geometry'], n_metal_join.inputs['Geometry'])
    n_metal_mat = nodes.new('GeometryNodeSetMaterial')
    links.new(n_metal_join.outputs['Geometry'], n_metal_mat.inputs['Geometry'])
    links.new(n_in.outputs['Material'], n_metal_mat.inputs['Material'])

    n_join = nodes.new('GeometryNodeJoinGeometry')
    links.new(n_metal_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_core_mat.outputs['Geometry'], n_join.inputs['Geometry'])
    links.new(n_join.outputs['Geometry'], n_out.inputs['Geometry'])

    return group


def build_weapons_template():
    """Legacy stub - weapon type selection is done in the operator."""
    return None

# ---------------------------------------------------------------------------
# Fuselage-specific helpers: N-point radius/height profile curves (each
# variant gets its own copy of the template with freshly randomized curve
# points -- Float Curve control points live in the node tree, not a modifier
# input, so they can't be varied per-object any other way), panel-line
# grooves cut with cylinder booleans, and optional finishing modifiers.
# ---------------------------------------------------------------------------

def _random_height_points(rng, count, max_step=0.35):
    count = max(2, count)
    xs = [i / (count - 1) for i in range(count)]
    y = rng.uniform(0.35, 0.9)
    ys = [y]
    for _ in range(count - 1):
        y = min(1.0, max(0.0, y + rng.uniform(-max_step, max_step)))
        ys.append(y)
    return list(zip(xs, ys))


NOSE_SPIKE_X = 0.10  # fraction of Length reserved for a distinct pointed nose protrusion


def _random_radius_points(rng, count, max_step=0.30):
    # Points 0 and 1 are a dedicated sharp nose spike (small radius at the very tip,
    # closely followed by the start of the main hull body) so the nose always reads as
    # a distinct protrusion instead of the body smoothly fading to a point. The rest is
    # a bounded random walk ending in a tapered (but not pointed) tail.
    count = max(3, count)
    body_count = count - 1
    xs_body = [NOSE_SPIKE_X + (1.0 - NOSE_SPIKE_X) * i / (body_count - 1) for i in range(body_count)]
    xs = [0.0] + xs_body

    nose_y = rng.uniform(0.0, 0.06)
    body_start_y = rng.uniform(0.35, 0.75)
    ys = [nose_y, body_start_y]
    y = body_start_y
    for _ in range(body_count - 2):
        y = min(1.0, max(0.05, y + rng.uniform(-max_step, max_step)))
        ys.append(y)
    tail_y = rng.uniform(0.08, 0.35)
    ys.append(tail_y)

    return list(zip(xs, ys))


def _set_curve_points(float_curve_node, points_xy, handle_types):
    curve = float_curve_node.mapping.curves[0]
    while len(curve.points) > 2:
        curve.points.remove(curve.points[-1])
    curve.points[0].location = points_xy[0]
    curve.points[0].handle_type = handle_types[0]
    curve.points[1].location = points_xy[-1]
    curve.points[1].handle_type = handle_types[-1]
    for (x, y), ht in zip(points_xy[1:-1], handle_types[1:-1]):
        pt = curve.points.new(x, y)
        pt.handle_type = ht
    float_curve_node.mapping.update()


def _resolve_handle_type(profile_style, rng):
    if profile_style == 'LINEAR':
        return 'VECTOR'
    if profile_style == 'SMOOTH':
        return 'AUTO_CLAMPED'
    return rng.choice(['VECTOR', 'AUTO_CLAMPED'])


# Fixed control-point/handle layouts for the non-organic archetypes. Unlike the random
# walk above, these use a SMALL number of straight-line (VECTOR) points on purpose --
# more points + smooth handles is what produced the uneven "vegetable" look the organic
# mode can fall into. Only a small jitter is applied per variant, so the silhouette
# family stays clean and mechanical instead of drifting back into noise.
_ARCHETYPE_PROFILE_BASE = {
    'WEDGE': (
        [(0.0, 0.05), (1.0, 1.0)],
        ['VECTOR', 'VECTOR'],
    ),
    'CYLINDER': (
        [(0.0, 0.2), (0.14, 0.95), (0.86, 0.95), (1.0, 0.2)],
        ['AUTO_CLAMPED', 'VECTOR', 'VECTOR', 'AUTO_CLAMPED'],
    ),
    'TRAPEZOID': (
        [(0.0, 0.35), (0.25, 0.9), (0.75, 0.9), (1.0, 0.55)],
        ['VECTOR', 'VECTOR', 'VECTOR', 'VECTOR'],
    ),
    'DIAMOND': (
        [(0.0, 0.05), (0.5, 1.0), (1.0, 0.05)],
        ['VECTOR', 'VECTOR', 'VECTOR'],
    ),
}


def _archetype_profile_points(rng, archetype, jitter=0.05):
    entry = _ARCHETYPE_PROFILE_BASE.get(archetype)
    if entry is None:
        return None, None
    base_points, handles = entry
    n = len(base_points)
    points = []
    for i, (x, y) in enumerate(base_points):
        if i == 0 or i == n - 1:
            xj = x
        else:
            xj = min(0.97, max(0.03, x + rng.uniform(-jitter, jitter)))
        yj = min(1.0, max(0.02, y + rng.uniform(-jitter, jitter)))
        points.append((xj, yj))
    return points, list(handles)


def specialize_fuselage_group_for_variant(template_group, rng, radius_point_count, height_point_count,
                                           profile_style, archetype='ORGANIC'):
    """Copy the fuselage template so this variant can carry its own curve shapes."""
    g = template_group.copy()

    radius_points, radius_handles = _archetype_profile_points(rng, archetype)
    if radius_points is None:
        body_handle = _resolve_handle_type(profile_style, rng)
        radius_points = _random_radius_points(rng, radius_point_count)
        radius_handles = ['VECTOR', 'VECTOR'] + [body_handle] * (len(radius_points) - 2)
    _set_curve_points(g.nodes[RADIUS_CURVE_NODE_NAME], radius_points, radius_handles)

    height_points, height_handles = _archetype_profile_points(rng, archetype)
    if height_points is None:
        height_points = _random_height_points(rng, height_point_count)
        height_handle = _resolve_handle_type(profile_style, rng)
        height_handles = [height_handle] * len(height_points)
    _set_curve_points(g.nodes[HEIGHT_CURVE_NODE_NAME], height_points, height_handles)

    return g


def add_panel_grooves(obj, length, ref_radius, ref_height_ratio, groove_center_y_frac, angles_deg, groove_widths):
    if not angles_deg:
        return
    groove_len = length * 0.55
    groove_center_y = length * groove_center_y_frac

    cutters = []
    for i, (ang, width) in enumerate(zip(angles_deg, groove_widths)):
        rad = math.radians(ang)
        offset_r = ref_radius * 0.92
        cx = math.cos(rad) * offset_r
        cz = math.sin(rad) * offset_r * ref_height_ratio
        bpy.ops.mesh.primitive_cylinder_add(
            radius=width, depth=groove_len, location=(cx, groove_center_y, cz)
        )
        cutter = bpy.context.active_object
        cutter.rotation_euler = (math.radians(90), 0, 0)
        cutter.name = f"{obj.name}_groove_cutter_{i}"
        cutters.append(cutter)

    bpy.context.view_layer.objects.active = obj
    for cutter in cutters:
        mod = obj.modifiers.new(f"Bool_{cutter.name}", 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = cutter
        mod.solver = 'EXACT'
        bpy.ops.object.modifier_apply(modifier=mod.name)

    for cutter in cutters:
        bpy.data.objects.remove(cutter, do_unlink=True)


def add_optional_modifiers(obj, s, rng, long_axis='Y'):
    """Live (unapplied) finishing modifiers -- stay hand-editable in Blender's modifier
    stack. glTF export (export_apply=True) bakes them automatically at export time.
    `long_axis` is the object's own "length" axis (Y for fuselage/engines/canopy/weapons,
    X for wings, Z for tails) so Twist/Taper/Bend deform along the right direction instead
    of squashing the cross-section."""
    if s.use_remesh:
        mod = obj.modifiers.new("Remesh", 'REMESH')
        mod.mode = 'SMOOTH'
        mod.octree_depth = s.remesh_octree_depth
        mod.use_smooth_shade = True

    if s.use_solidify:
        mod = obj.modifiers.new("Solidify", 'SOLIDIFY')
        mod.thickness = s.solidify_thickness

    if s.use_bend:
        mod = obj.modifiers.new("SimpleDeform", 'SIMPLE_DEFORM')
        mod.deform_method = 'BEND'
        mod.deform_axis = 'Z'
        mod.angle = math.radians(s.bend_angle_deg)

    # Twist/Taper: smooth, mathematical deformations (not per-vertex noise), so they
    # sharpen/dynamize the silhouette without reintroducing the "vegetable" bumpiness of
    # heavy randomization. Randomized per variant (unlike Bend's single fixed angle above)
    # since these are meant to feed variety straight into random generation.
    if s.use_twist:
        mod = obj.modifiers.new("SimpleDeformTwist", 'SIMPLE_DEFORM')
        mod.deform_method = 'TWIST'
        mod.deform_axis = long_axis
        mod.angle = math.radians(_rr(rng, s.twist_angle_min, s.twist_angle_max))

    if s.use_taper:
        mod = obj.modifiers.new("SimpleDeformTaper", 'SIMPLE_DEFORM')
        mod.deform_method = 'TAPER'
        mod.deform_axis = long_axis
        mod.factor = _rr(rng, s.taper_factor_min, s.taper_factor_max)


def make_material(name, base_color, metallic, roughness=0.4):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = base_color
    mat.metallic = metallic
    mat.roughness = roughness
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = base_color
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
    return mat


def make_glow_material(name, color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Emission'].default_value = color
        bsdf.inputs['Emission Strength'].default_value = 4.0
    return mat


def export_object_glb(obj, filepath):
    """Duplicates object (and any children), applies all modifiers, joins for export,
    resets to origin, and cleans up. Resetting to origin before export means a part's
    viewport-grid position (from batch generation) never gets baked into the exported
    glTF node transform."""
    bpy.ops.object.select_all(action='DESELECT')

    def select_hierarchy(o):
        o.select_set(True)
        for child in o.children:
            select_hierarchy(child)

    select_hierarchy(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.duplicate()
    copied_objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    if not copied_objs:
        return

    bpy.ops.object.select_all(action='DESELECT')
    for co in copied_objs:
        co.select_set(True)
    bpy.context.view_layer.objects.active = copied_objs[0]

    bpy.ops.object.convert(target='MESH')
    if len(copied_objs) > 1:
        bpy.ops.object.join()

    main_export_obj = bpy.context.active_object
    main_export_obj.location = (0.0, 0.0, 0.0)
    main_export_obj.rotation_euler = (0.0, 0.0, 0.0)
    main_export_obj.scale = (1.0, 1.0, 1.0)
    main_export_obj.name = obj.name + '_gltf_export_temp'

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
    )

    bpy.data.objects.remove(main_export_obj, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    select_hierarchy(obj)
    bpy.context.view_layer.objects.active = obj


def export_assembly_glb(objs, filepath):
    """Like export_object_glb, but for a list of independent objects that are NOT a
    Blender parent/child hierarchy (Assembly parts are separate top-level objects
    positioned in world space) -- duplicates all of them, bakes each one's own
    modifier stack (Mirror/Twist/Taper/Lattice/whatever), joins them into a single
    mesh (each source object's material becomes its own material slot on the result),
    and exports as one combined GLB. This is what makes the whole assembled ship
    importable into Cocos Creator as one model instead of one file per part."""
    objs = [o for o in objs if o.type == 'MESH']
    if not objs:
        return False

    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.duplicate()
    copied_objs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    if not copied_objs:
        return False

    bpy.ops.object.select_all(action='DESELECT')
    for co in copied_objs:
        co.select_set(True)
    bpy.context.view_layer.objects.active = copied_objs[0]

    bpy.ops.object.convert(target='MESH')
    if len(copied_objs) > 1:
        bpy.ops.object.join()

    main_export_obj = bpy.context.active_object
    main_export_obj.location = (0.0, 0.0, 0.0)
    main_export_obj.rotation_euler = (0.0, 0.0, 0.0)
    main_export_obj.scale = (1.0, 1.0, 1.0)
    main_export_obj.name = "assembly_gltf_export_temp"

    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
    )

    bpy.data.objects.remove(main_export_obj, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    return True

# ---------------------------------------------------------------------------
# Settings / per-category variant generators / Operators / Panel
# ---------------------------------------------------------------------------

class FighterGenSettings(PropertyGroup):
    part_type: EnumProperty(name='Part Type', items=[('FUSELAGE', 'Fuselage', 'Generate fuselage variants'), ('WINGS', 'Wings', 'Generate wing/canard variants'), ('ENGINES', 'Engines', 'Generate engine variants'), ('CANOPY', 'Canopy', 'Generate canopy glass variants'), ('TAILS', 'Tails', 'Generate vertical tail variants'), ('WEAPONS', 'Weapons', 'Generate weapon pod variants')], default='FUSELAGE')
    random_seed: IntProperty(name='Random Seed', default=0)
    variant_count: IntProperty(name='Variant Count', default=6, min=1, max=64)
    name_prefix: StringProperty(name='Name Prefix', default='part')
    show_advanced: BoolProperty(
        name='Show Advanced Parameters', default=False,
        description="Fine-grained random-range sliders -- usually not needed since generated objects are hand-edited directly afterward",
    )
    spacing: FloatProperty(name='Grid Spacing', default=1.0, min=0.2, max=5.0)
    export_glb: BoolProperty(name='Export GLB on Generate', default=False)
    export_dir: StringProperty(
        name="Export Folder (parts root)",
        default=r"Z:\HTMLShooterCocos\cocos_project\tools\fighter-generator\public\parts",
        subtype='DIR_PATH',
    )
    cocos_export_dir: StringProperty(
        name="Cocos Export Folder",
        default=r"Z:\HTMLShooterCocos\cocos_project\assets\resources\Models",
        subtype='DIR_PATH',
        description="Where 'Export Assembly to Cocos' writes the combined GLB -- matches the project's existing assets/resources/Models convention, so Cocos Creator picks it up automatically",
    )

    length_min: FloatProperty(name='Length Min', default=3.0, min=0.1)
    length_max: FloatProperty(name='Length Max', default=4.6, min=0.1)
    fuselage_archetype: EnumProperty(
        name='Fuselage Archetype',
        items=[
            ('RANDOM', "Random (pick per variant)", "Picks a different archetype below for each generated variant"),
            ('ORGANIC', "Organic (Random)", "Bounded random-walk silhouette -- most variety, can look uneven at high point counts"),
            ('WEDGE', "Wedge / Triangle", "Straight monotonic taper, pointed nose to a blunt tail -- clean dart/cone silhouette"),
            ('CYLINDER', "Cylinder / Round", "Near-constant radius with short rounded end caps -- clean tube/capsule silhouette"),
            ('TRAPEZOID', "Trapezoid", "Flat mid-section with blunt (non-pointed) ramps at both ends -- boxy, mechanical silhouette"),
            ('DIAMOND', "Diamond", "Symmetric taper to a point at both ends via a wide midsection -- clean spindle silhouette"),
        ],
        default='RANDOM',
        description="Non-Organic options use a small fixed set of straight-line control points instead of full random-walk noise, so raising point count/curviness elsewhere won't make them bumpy",
    )
    profile_style: EnumProperty(name='Profile Style', items=[('LINEAR', 'Linear', ''), ('SMOOTH', 'Smooth', ''), ('MIXED', 'Mixed', '')], default='MIXED')
    radius_point_count: IntProperty(name='Radius Points', default=5, min=3)
    radius_floor: FloatProperty(name='Radius Floor', default=0.04, min=0.0)
    radius_ceiling: FloatProperty(name='Radius Ceiling', default=0.6, min=0.01)
    height_point_count: IntProperty(name='Height Points', default=3, min=2)
    height_floor: FloatProperty(name='Height Ratio Floor', default=0.45, min=0.05, max=1.0)
    height_ceiling: FloatProperty(name='Height Ratio Ceiling', default=0.9, min=0.05, max=1.0)
    fuse_vpinch_min: FloatProperty(name='Vertical Pinch Min', default=-0.55, min=-0.95, max=0.95,
        description='Shrinks/grows the top vs. bottom half of the cross-section independently, instead of an even radial ellipse. Negative = flatten bottom (belly), positive = flatten top')
    fuse_vpinch_max: FloatProperty(name='Vertical Pinch Max', default=0.55, min=-0.95, max=0.95)
    sides_min: IntProperty(name='Sides Min', default=5, min=3, max=32)
    sides_max: IntProperty(name='Sides Max', default=10, min=3, max=32)
    fuse_subdiv: IntProperty(name='Subdivision', default=1, min=0, max=3)
    bevel_width: FloatProperty(name='Bevel Width', default=0.012, min=0.0, max=0.2)
    bevel_angle_deg: FloatProperty(name='Bevel Angle', default=35.0, min=1.0, max=89.0)

    wing_span_min: FloatProperty(name='Span Min', default=1.5, min=0.1)
    wing_span_max: FloatProperty(name='Span Max', default=3.0, min=0.1)
    wing_root_min: FloatProperty(name='Root Chord Min', default=1.0, min=0.1)
    wing_root_max: FloatProperty(name='Root Chord Max', default=2.2, min=0.1)
    wing_tip_min: FloatProperty(name='Tip Chord Min', default=0.15, min=0.05)
    wing_tip_max: FloatProperty(name='Tip Chord Max', default=0.5, min=0.05)
    wing_sweep_min: FloatProperty(name='Sweep Min', default=0.1, min=-2.0)
    wing_sweep_max: FloatProperty(name='Sweep Max', default=1.2, min=-2.0)
    wing_thick_min: FloatProperty(name='Thickness Min', default=0.07, min=0.005)
    wing_thick_max: FloatProperty(name='Thickness Max', default=0.20, min=0.005)
    wing_thick_mid_min: FloatProperty(name='Mid-Thick Min', default=0.45, min=0.0, max=2.0)
    wing_thick_mid_max: FloatProperty(name='Mid-Thick Max', default=0.85, min=0.0, max=2.0)
    wing_root_thick_min: FloatProperty(name='Root Thickness Min', default=0.8, min=0.0, max=2.0,
        description='Thickness scale at the fuselage-side root. Higher than Tip = thick root/thin tip')
    wing_root_thick_max: FloatProperty(name='Root Thickness Max', default=1.3, min=0.0, max=2.0)
    wing_tip_thick_min: FloatProperty(name='Tip Thickness Min', default=0.15, min=0.0, max=2.0,
        description='Thickness scale at the wingtip. Higher than Root = thin root/thick tip')
    wing_tip_thick_max: FloatProperty(name='Tip Thickness Max', default=0.4, min=0.0, max=2.0)
    wing_dihedral_min: FloatProperty(name='Dihedral Min', default=-0.2, min=-2.0, max=2.0)
    wing_dihedral_max: FloatProperty(name='Dihedral Max', default=0.4, min=-2.0, max=2.0)
    wing_twist_min: FloatProperty(name='Twist Min (rad)', default=-0.1, min=-1.5, max=1.5)
    wing_twist_max: FloatProperty(name='Twist Max (rad)', default=0.15, min=-1.5, max=1.5)
    wing_sharp_min: FloatProperty(name='Airfoil Sharpness Min', default=0.7, min=0.1, max=3.0)
    wing_sharp_max: FloatProperty(name='Airfoil Sharpness Max', default=1.6, min=0.1, max=3.0)
    wing_subdiv: IntProperty(name='Subdivision', default=1, min=0, max=3)

    eng_len_min: FloatProperty(name='Length Min', default=0.8, min=0.1)
    eng_len_max: FloatProperty(name='Length Max', default=1.6, min=0.1)
    eng_rad_min: FloatProperty(name='Radius Min', default=0.18, min=0.05)
    eng_rad_max: FloatProperty(name='Radius Max', default=0.35, min=0.05)
    eng_ex_min: FloatProperty(name='Exhaust Ratio Min', default=0.5, min=0.1, max=1.5)
    eng_ex_max: FloatProperty(name='Exhaust Ratio Max', default=0.9, min=0.1, max=1.5)
    eng_roundness_min: FloatProperty(name='Roundness Min', default=0.2, min=0.0, max=1.0)
    eng_roundness_max: FloatProperty(name='Roundness Max', default=0.8, min=0.0, max=1.0)
    eng_stripes_min: FloatProperty(name='Stripe Count Min', default=4.0, min=1.0, max=16.0)
    eng_stripes_max: FloatProperty(name='Stripe Count Max', default=10.0, min=1.0, max=16.0)
    eng_twist_min: FloatProperty(name='Twist Min', default=2.0, min=0.0, max=15.0)
    eng_twist_max: FloatProperty(name='Twist Max', default=8.0, min=0.0, max=15.0)
    eng_subdiv: IntProperty(name='Subdivision', default=1, min=0, max=3)

    canopy_len_min: FloatProperty(name='Length Min', default=0.8, min=0.1)
    canopy_len_max: FloatProperty(name='Length Max', default=1.6, min=0.1)
    canopy_width_min: FloatProperty(name='Width Min', default=0.3, min=0.1)
    canopy_width_max: FloatProperty(name='Width Max', default=0.6, min=0.1)
    canopy_height_min: FloatProperty(name='Height Min', default=0.2, min=0.1)
    canopy_height_max: FloatProperty(name='Height Max', default=0.5, min=0.1)
    canopy_teardrop_min: FloatProperty(name='Teardrop Min', default=-0.5, min=-2.0, max=2.0)
    canopy_teardrop_max: FloatProperty(name='Teardrop Max', default=0.5, min=-2.0, max=2.0)
    canopy_stretch_min: FloatProperty(name='Stretch Min', default=-0.4, min=-2.0, max=2.0)
    canopy_stretch_max: FloatProperty(name='Stretch Max', default=0.4, min=-2.0, max=2.0)
    canopy_subdiv: IntProperty(name='Subdivision', default=2, min=0, max=4)

    wp_type: EnumProperty(name='Weapon Type', items=[('RANDOM', 'Random (pick per variant)', 'Picks a different weapon type for each generated variant'), ('CANNON', 'Heavy Cannon', 'Artillery / heavy shell gun'), ('GATLING', 'Machine Gun / Gatling', 'Rapid fire jacketed gun'), ('RAILGUN', 'Electromagnetic Railgun', 'Plasma core dual accelerator')], default='RANDOM')
    wp_len_min: FloatProperty(name='Weapon Length Min', default=0.9, min=0.1)
    wp_len_max: FloatProperty(name='Weapon Length Max', default=1.7, min=0.1)
    wp_rad_min: FloatProperty(name='Weapon Radius Min', default=0.08, min=0.02)
    wp_rad_max: FloatProperty(name='Weapon Radius Max', default=0.16, min=0.02)
    wp_barrel_min: FloatProperty(name='Barrel Length Ratio Min', default=0.45, min=0.1, max=0.95)
    wp_barrel_max: FloatProperty(name='Barrel Length Ratio Max', default=0.75, min=0.1, max=0.95)
    wp_muzzle_min: FloatProperty(name='Muzzle Width Ratio Min', default=1.2, min=1.0, max=3.0)
    wp_muzzle_max: FloatProperty(name='Muzzle Width Ratio Max', default=1.8, min=1.0, max=3.0)

    groove_count_min: IntProperty(name='Grooves Min', default=0, min=0)
    groove_count_max: IntProperty(name='Grooves Max', default=3, min=0)
    groove_spread_deg_min: FloatProperty(name='Spread Min (deg)', default=40.0, min=0.0)
    groove_spread_deg_max: FloatProperty(name='Spread Max (deg)', default=160.0, min=0.0)
    groove_center_deg_min: FloatProperty(name='Center Min (deg)', default=60.0, min=-180.0)
    groove_center_deg_max: FloatProperty(name='Center Max (deg)', default=120.0, min=-180.0)
    groove_width_min: FloatProperty(name='Width Min', default=0.012, min=0.001)
    groove_width_max: FloatProperty(name='Width Max', default=0.035, min=0.001)
    groove_y_frac_min: FloatProperty(name='Y Min', default=0.25, min=0.0)
    groove_y_frac_max: FloatProperty(name='Y Max', default=0.55, min=0.0)

    use_remesh: BoolProperty(name="Remesh (Smooth)", default=False)
    remesh_octree_depth: IntProperty(name="Remesh Octree Depth", default=6, min=1, max=10)
    use_solidify: BoolProperty(name="Solidify", default=False)
    solidify_thickness: FloatProperty(name="Solidify Thickness", default=0.02, min=-1.0, max=1.0)
    use_bend: BoolProperty(name="Simple Deform (Bend)", default=False)
    bend_angle_deg: FloatProperty(name="Bend Z Angle (deg)", default=0.0, min=-180.0, max=180.0)
    use_twist: BoolProperty(name="Simple Deform (Twist)", default=True,
        description="Randomized per-variant twist along the part's long axis -- dynamic, edgy silhouette without adding mesh noise")
    twist_angle_min: FloatProperty(name="Twist Angle Min (deg)", default=-35.0, min=-180.0, max=180.0)
    twist_angle_max: FloatProperty(name="Twist Angle Max (deg)", default=35.0, min=-180.0, max=180.0)
    use_taper: BoolProperty(name="Simple Deform (Taper)", default=True,
        description="Randomized per-variant taper along the part's long axis -- sharpens one end without adding mesh noise")
    taper_factor_min: FloatProperty(name="Taper Factor Min", default=-0.45, min=-1.0, max=1.0)
    taper_factor_max: FloatProperty(name="Taper Factor Max", default=0.45, min=-1.0, max=1.0)
    metallic: FloatProperty(name="Metallic", default=0.8, min=0.0, max=1.0)
    primary_color: FloatVectorProperty(name="Primary Color", subtype='COLOR', size=4,
        default=(0.55, 0.58, 0.62, 1.0), min=0.0, max=1.0,
        description="Base hull color applied to every generated part -- change this to repaint the whole ship at once")
    accent_glow_color: FloatVectorProperty(name="Accent Glow Color", subtype='COLOR', size=4,
        default=(0.0, 1.0, 1.0, 1.0), min=0.0, max=1.0,
        description="Emissive color for engine exhaust rings and weapon glow bits")

    # Detail pass: applied on-demand to whatever is currently SELECTED (see
    # fightergen.apply_detail_pass), not baked into every batch-generated variant --
    # two voxel remeshes plus a wireframe-duplicate are expensive enough that running
    # them on every random variant (most of which get discarded) would be wasteful.
    use_detail_remesh1: BoolProperty(name="Remesh 1 (Blocks)", default=False)
    detail_remesh1_octree_min: IntProperty(name="Remesh 1 Octree Min", default=5, min=1, max=10)
    detail_remesh1_octree_max: IntProperty(name="Remesh 1 Octree Max", default=6, min=1, max=10)
    detail_remesh1_scale: FloatProperty(name="Remesh 1 Scale", default=0.9, min=0.1, max=0.99)
    use_detail_remesh2: BoolProperty(name="Remesh 2 (Sharp)", default=False)
    detail_remesh2_octree_min: IntProperty(name="Remesh 2 Octree Min", default=4, min=1, max=10)
    detail_remesh2_octree_max: IntProperty(name="Remesh 2 Octree Max", default=5, min=1, max=10)
    detail_remesh2_scale: FloatProperty(name="Remesh 2 Scale", default=0.9, min=0.1, max=0.99)
    detail_remesh2_sharpness: FloatProperty(name="Remesh 2 Sharpness", default=1.0, min=0.0, max=1.0)
    use_detail_bevel: BoolProperty(name="Bevel", default=False)
    detail_bevel_width: FloatProperty(name="Detail Bevel Width", default=0.1, min=0.0, max=0.5)
    detail_bevel_angle_deg: FloatProperty(name="Detail Bevel Angle", default=30.0, min=1.0, max=180.0)
    use_wireframe_detail: BoolProperty(name="Wireframe Copy", default=False,
        description="Duplicates the object and adds a Wireframe modifier to the copy (cage overlay on top of the solid part)")
    wireframe_thickness: FloatProperty(name="Wireframe Thickness", default=0.1, min=0.001, max=1.0)
    wireframe_offset: FloatProperty(name="Wireframe Offset", default=0.3, min=-1.0, max=1.0)

    assemble_wing_attach_min: FloatProperty(name="Wing Attach Y Min (frac of Length)", default=0.45, min=0.05, max=0.95)
    assemble_wing_attach_max: FloatProperty(name="Wing Attach Y Max (frac of Length)", default=0.62, min=0.05, max=0.95)
    assemble_wing_overlap: FloatProperty(name="Wing Root Overlap", default=0.85, min=0.5, max=1.05)
    assemble_subwing_enable: BoolProperty(name="Include Sub-Wing (Canard)", default=True,
        description="Adds a smaller second wing pair further forward, using the same random ranges as the main wing scaled down")
    assemble_subwing_attach_min: FloatProperty(name="Sub-Wing Attach Y Min (frac of Length)", default=0.16, min=0.02, max=0.9)
    assemble_subwing_attach_max: FloatProperty(name="Sub-Wing Attach Y Max (frac of Length)", default=0.30, min=0.02, max=0.9)
    assemble_subwing_scale: FloatProperty(name="Sub-Wing Size Scale", default=0.32, min=0.1, max=1.0,
        description="Multiplies the main wing's Span/Chord/Sweep ranges to size the sub-wing down")
    assemble_aileron_enable: BoolProperty(name="Include Aileron", default=False,
        description="Adds a small flat control-surface flap on the trailing edge of the wing and (if present) sub-wing")
    assemble_aileron_span_frac_min: FloatProperty(name="Aileron Position Min (frac of parent Span)", default=0.55, min=0.05, max=0.95)
    assemble_aileron_span_frac_max: FloatProperty(name="Aileron Position Max (frac of parent Span)", default=0.85, min=0.05, max=0.95)
    assemble_aileron_size_scale: FloatProperty(name="Aileron Size Scale", default=0.28, min=0.05, max=0.8,
        description="Multiplies the main wing's Span/Chord ranges to size the aileron down")

    assemble_engine_pod_enable: BoolProperty(name="Include Wing Engine Pod(s)", default=True,
        description="Hangs a plain cylindrical jet nacelle under the main wing, raycast-flush to its underside")
    assemble_engine_pod_count: IntProperty(name="Engine Pods per Wing", default=1, min=1, max=2,
        description="1 = one pod per wing (2 total); 2 = an inboard+outboard pair per wing (4 total)")
    assemble_engine_pod_span_frac_min: FloatProperty(name="Pod Position Min (frac of Span)", default=0.25, min=0.05, max=0.9)
    assemble_engine_pod_span_frac_max: FloatProperty(name="Pod Position Max (frac of Span)", default=0.60, min=0.05, max=0.9)
    assemble_engine_pod_length_min: FloatProperty(name="Pod Length Min", default=0.9, min=0.1)
    assemble_engine_pod_length_max: FloatProperty(name="Pod Length Max", default=1.5, min=0.1)
    assemble_engine_pod_radius_min: FloatProperty(name="Pod Radius Min", default=0.16, min=0.02)
    assemble_engine_pod_radius_max: FloatProperty(name="Pod Radius Max", default=0.26, min=0.02)

    assemble_wing_weapon_enable: BoolProperty(name="Include Wing Weapon", default=False,
        description="Mounts a weapon (same random ranges as the Weapons category) on top of the wing, raycast-flush -- mirrored, so the same weapon appears on both wings")
    assemble_wing_weapon_span_frac_min: FloatProperty(name="Weapon Position Min (frac of Span)", default=0.30, min=0.05, max=0.9)
    assemble_wing_weapon_span_frac_max: FloatProperty(name="Weapon Position Max (frac of Span)", default=0.55, min=0.05, max=0.9)

    assemble_tail_enable: BoolProperty(name="Include Tail", default=True,
        description="Raycast-attaches a vertical/V-tail pair to the aft section of the fuselage")
    assemble_tail_y_frac_min: FloatProperty(name="Tail Attach Y Min", default=0.70, min=0.5, max=0.95)
    assemble_tail_y_frac_max: FloatProperty(name="Tail Attach Y Max", default=0.88, min=0.5, max=0.95)

    assemble_canopy_enable: BoolProperty(name="Include Canopy", default=True,
        description="Raycast-attaches a cockpit canopy to the forward upper hull surface of the fuselage")
    assemble_canopy_y_frac_min: FloatProperty(name="Canopy Attach Y Min", default=0.25, min=0.05, max=0.6)
    assemble_canopy_y_frac_max: FloatProperty(name="Canopy Attach Y Max", default=0.40, min=0.05, max=0.6)


CATEGORY_FOLDERS = {
    'FUSELAGE': 'fuselage', 'WINGS': 'wings', 'ENGINES': 'engines',
    'CANOPY': 'canopy', 'TAILS': 'tails', 'WEAPONS': 'weapons',
}


def _rr(rng, a, b):
    lo, hi = sorted((a, b))
    return rng.uniform(lo, hi)


def _apply_bevel(obj, s):
    if s.bevel_width > 0.0:
        bevel = obj.modifiers.new("EdgeBevel", 'BEVEL')
        bevel.width = s.bevel_width
        bevel.segments = 2
        bevel.limit_method = 'ANGLE'
        bevel.angle_limit = math.radians(s.bevel_angle_deg)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=bevel.name)


def _apply_detail_pass(obj, s):
    """Live Remesh(Blocks)->Remesh(Sharp)->Bevel stack, matching the user's manual
    hard-surface workflow, plus an optional Wireframe-modifier duplicate as a cage
    overlay. Deliberately NOT wired into random generation -- run via the
    'Apply Detail Pass to Selected' button on whatever part you've already picked, since
    two voxel remeshes are expensive to redo on every random batch variant."""
    if s.use_detail_remesh1:
        mod = obj.modifiers.new("DetailRemesh1_Blocks", 'REMESH')
        mod.mode = 'BLOCKS'
        mod.octree_depth = random.randint(*sorted((s.detail_remesh1_octree_min, s.detail_remesh1_octree_max)))
        mod.scale = s.detail_remesh1_scale
        mod.use_remove_disconnected = True
        mod.threshold = 1.0

    if s.use_detail_remesh2:
        mod = obj.modifiers.new("DetailRemesh2_Sharp", 'REMESH')
        mod.mode = 'SHARP'
        mod.octree_depth = random.randint(*sorted((s.detail_remesh2_octree_min, s.detail_remesh2_octree_max)))
        mod.scale = s.detail_remesh2_scale
        mod.sharpness = s.detail_remesh2_sharpness
        mod.use_remove_disconnected = True
        mod.threshold = 1.0

    if s.use_detail_bevel:
        mod = obj.modifiers.new("DetailBevel", 'BEVEL')
        mod.width = s.detail_bevel_width
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(s.detail_bevel_angle_deg)

    if s.use_wireframe_detail:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.duplicate()
        dup = bpy.context.active_object
        dup.name = obj.name + "_wireframe"
        wf = dup.modifiers.new("Wireframe", 'WIREFRAME')
        wf.thickness = s.wireframe_thickness
        wf.offset = s.wireframe_offset
        wf.use_replace = True
        wf.use_even_offset = True
        wf.use_relative_offset = True


def _finish_gn_object(name, template, socket_values, mat_base=None, mat_glow=None):
    mesh = bpy.data.meshes.new(name + "_mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mod = obj.modifiers.new("GN_Part", 'NODES')
    mod.node_group = template
    for socket in template.inputs:
        if socket.name in socket_values:
            mod[socket.identifier] = socket_values[socket.name]
        elif socket.name == 'Material' and mat_base is not None:
            mod[socket.identifier] = mat_base
        elif socket.name == 'MaterialGlow' and mat_glow is not None:
            mod[socket.identifier] = mat_glow

    # bpy.ops.object.convert operates on every currently SELECTED object, not just the
    # active one -- without deselecting first, any earlier part still selected from its
    # own creation (e.g. a wing with a live Mirror/Twist/Taper stack) gets silently
    # re-converted too, baking away and removing modifiers that were meant to stay live.
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return obj


_FUSELAGE_ARCHETYPE_CHOICES = ['ORGANIC', 'WEDGE', 'CYLINDER', 'TRAPEZOID', 'DIAMOND']


def _generate_fuselage_variant(rng, name, s, mat_base):
    template = build_fuselage_template()
    archetype = s.fuselage_archetype
    if archetype == 'RANDOM':
        archetype = rng.choice(_FUSELAGE_ARCHETYPE_CHOICES)
    variant_group = specialize_fuselage_group_for_variant(
        template, rng, s.radius_point_count, s.height_point_count, s.profile_style, archetype
    )

    p = {
        'Length': _rr(rng, s.length_min, s.length_max),
        'RadiusFloor': s.radius_floor,
        'RadiusCeiling': s.radius_ceiling,
        'HeightFloor': s.height_floor,
        'HeightCeiling': s.height_ceiling,
        'VerticalPinch': _rr(rng, s.fuse_vpinch_min, s.fuse_vpinch_max),
        'CrossSectionSides': rng.randint(*sorted((s.sides_min, s.sides_max))),
        'Subdivision': s.fuse_subdiv,
    }
    obj = _finish_gn_object(name, variant_group, p, mat_base=mat_base)

    groove_count = rng.randint(*sorted((s.groove_count_min, s.groove_count_max)))
    groove_spread = _rr(rng, s.groove_spread_deg_min, s.groove_spread_deg_max)
    groove_center = _rr(rng, s.groove_center_deg_min, s.groove_center_deg_max)
    if groove_count <= 0:
        groove_angles = []
    elif groove_count == 1:
        groove_angles = [groove_center]
    else:
        groove_angles = [
            groove_center - groove_spread / 2 + k * (groove_spread / (groove_count - 1))
            for k in range(groove_count)
        ]
    groove_widths = [_rr(rng, s.groove_width_min, s.groove_width_max) for _ in groove_angles]
    groove_y_frac = _rr(rng, s.groove_y_frac_min, s.groove_y_frac_max)

    ref_radius = (s.radius_floor + s.radius_ceiling) / 2.0
    ref_height_ratio = (s.height_floor + s.height_ceiling) / 2.0
    add_panel_grooves(obj, p['Length'], ref_radius, ref_height_ratio, groove_y_frac, groove_angles, groove_widths)

    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = math.radians(35)
    _apply_bevel(obj, s)
    return obj


def _generate_wing_or_tail_variant(rng, name, s, mat_base, is_tail):
    template = build_tails_template() if is_tail else build_wings_template()
    p = {
        'Span': _rr(rng, s.wing_span_min, s.wing_span_max),
        'RootChord': _rr(rng, s.wing_root_min, s.wing_root_max),
        'TipChord': _rr(rng, s.wing_tip_min, s.wing_tip_max),
        'Sweep': _rr(rng, s.wing_sweep_min, s.wing_sweep_max),
        'Thickness': _rr(rng, s.wing_thick_min, s.wing_thick_max),
        'ThicknessMid': _rr(rng, s.wing_thick_mid_min, s.wing_thick_mid_max),
        'RootThickness': _rr(rng, s.wing_root_thick_min, s.wing_root_thick_max),
        'TipThickness': _rr(rng, s.wing_tip_thick_min, s.wing_tip_thick_max),
        'Dihedral': _rr(rng, s.wing_dihedral_min, s.wing_dihedral_max),
        'Twist': _rr(rng, s.wing_twist_min, s.wing_twist_max),
        'AirfoilSharpness': _rr(rng, s.wing_sharp_min, s.wing_sharp_max),
        'LeadingEdgeMid': rng.uniform(0.0, 0.5),
        'TrailingEdgeMid': rng.uniform(0.0, 0.5),
        'Subdivision': s.wing_subdiv,
    }
    obj = _finish_gn_object(name, template, p, mat_base=mat_base)
    _apply_bevel(obj, s)
    return obj


def _generate_engine_variant(rng, name, s, mat_base, mat_glow):
    template = build_engines_template()
    p = {
        'Length': _rr(rng, s.eng_len_min, s.eng_len_max),
        'Radius': _rr(rng, s.eng_rad_min, s.eng_rad_max),
        'ExhaustRadius': _rr(rng, s.eng_ex_min, s.eng_ex_max),
        'Roundness': _rr(rng, s.eng_roundness_min, s.eng_roundness_max),
        'StripeCount': _rr(rng, s.eng_stripes_min, s.eng_stripes_max),
        'TwistAmount': _rr(rng, s.eng_twist_min, s.eng_twist_max),
        'Subdivision': s.eng_subdiv,
        'L1_OffsetX': rng.uniform(-0.08, 0.08), 'L1_OffsetY': rng.uniform(-0.05, 0.1), 'L1_OffsetZ': rng.uniform(-0.05, 0.05),
        'L1_ScaleX': rng.uniform(0.9, 1.15), 'L1_ScaleY': rng.uniform(0.9, 1.15), 'L1_ScaleZ': rng.uniform(0.9, 1.15),
        'L2_OffsetX': rng.uniform(-0.08, 0.08), 'L2_OffsetY': rng.uniform(-0.1, 0.15), 'L2_OffsetZ': rng.uniform(-0.05, 0.05),
        'L2_ScaleX': rng.uniform(0.9, 1.1), 'L2_ScaleY': rng.uniform(0.9, 1.1), 'L2_ScaleZ': rng.uniform(0.9, 1.1),
        'L3_OffsetX': rng.uniform(-0.05, 0.05), 'L3_OffsetY': rng.uniform(-0.05, 0.05), 'L3_OffsetZ': rng.uniform(-0.05, 0.05),
        'L3_ScaleX': rng.uniform(0.9, 1.1), 'L3_ScaleY': rng.uniform(0.9, 1.1), 'L3_ScaleZ': rng.uniform(0.9, 1.1),
    }
    obj = _finish_gn_object(name, template, p, mat_base=mat_base, mat_glow=mat_glow)
    _apply_bevel(obj, s)
    return obj


def _generate_canopy_variant(rng, name, s, mat_base):
    template = build_canopy_template()
    p = {
        'Length': _rr(rng, s.canopy_len_min, s.canopy_len_max),
        'Width': _rr(rng, s.canopy_width_min, s.canopy_width_max),
        'Height': _rr(rng, s.canopy_height_min, s.canopy_height_max),
        'Teardrop': _rr(rng, s.canopy_teardrop_min, s.canopy_teardrop_max),
        'Stretch': _rr(rng, s.canopy_stretch_min, s.canopy_stretch_max),
        'Subdivision': s.canopy_subdiv,
    }
    return _finish_gn_object(name, template, p, mat_base=mat_base)


_WEAPON_TYPE_CHOICES = ['CANNON', 'GATLING', 'RAILGUN']


def _generate_weapon_variant(rng, name, s, mat_base, mat_glow):
    length = _rr(rng, s.wp_len_min, s.wp_len_max)
    radius = _rr(rng, s.wp_rad_min, s.wp_rad_max)
    barrel_ratio = _rr(rng, s.wp_barrel_min, s.wp_barrel_max)

    wp_type = s.wp_type
    if wp_type == 'RANDOM':
        wp_type = rng.choice(_WEAPON_TYPE_CHOICES)

    if wp_type == 'CANNON':
        template = build_cannon_template()
        p = {'Length': length, 'Radius': radius, 'BarrelLength': barrel_ratio,
             'MuzzleWidth': _rr(rng, s.wp_muzzle_min, s.wp_muzzle_max)}
    elif wp_type == 'GATLING':
        template = build_gatling_template()
        p = {'Length': length, 'Radius': radius, 'BarrelLength': barrel_ratio}
    else:
        template = build_railgun_template()
        p = {'Length': length, 'Radius': radius, 'BarrelLength': barrel_ratio}

    return _finish_gn_object(name, template, p, mat_base=mat_base, mat_glow=mat_glow)


def _clear_variant_collection():
    coll = bpy.data.collections.get(VARIANT_COLLECTION)
    if coll is None:
        coll = bpy.data.collections.new(VARIANT_COLLECTION)
        bpy.context.scene.collection.children.link(coll)
        return coll
    for obj in list(coll.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    return coll


class FIGHTERGEN_OT_generate(Operator):
    bl_idname = "fightergen.generate_variants"
    bl_label = "Generate Variants"
    bl_description = "Generate batch of editable fighter parts with advanced modifiers"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        rng = random.Random(s.random_seed if s.random_seed != 0 else None)
        coll = _clear_variant_collection()

        part = s.part_type
        cat_lower = CATEGORY_FOLDERS[part]

        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)
        mat_glow = None
        if part in ('WEAPONS', 'ENGINES'):
            mat_glow = make_glow_material('FighterGen_Glow', tuple(s.accent_glow_color))

        cols = max(1, math.ceil(math.sqrt(s.variant_count)))
        x_step = 2.0 * s.spacing
        y_step = 4.0 * s.spacing

        exported = []
        for i in range(s.variant_count):
            name = f"{s.name_prefix}_{i:02d}"

            if part == 'FUSELAGE':
                obj = _generate_fuselage_variant(rng, name, s, mat_base)
            elif part == 'WINGS':
                obj = _generate_wing_or_tail_variant(rng, name, s, mat_base, is_tail=False)
            elif part == 'TAILS':
                obj = _generate_wing_or_tail_variant(rng, name, s, mat_base, is_tail=True)
            elif part == 'ENGINES':
                obj = _generate_engine_variant(rng, name, s, mat_base, mat_glow)
            elif part == 'CANOPY':
                obj = _generate_canopy_variant(rng, name, s, mat_base)
            elif part == 'WEAPONS':
                obj = _generate_weapon_variant(rng, name, s, mat_base, mat_glow)
            else:
                continue

            long_axis = {'WINGS': 'X', 'TAILS': 'Z'}.get(part, 'Y')
            add_optional_modifiers(obj, s, rng, long_axis)

            row, col = divmod(i, cols)
            obj.location = (col * x_step, row * y_step, 0.0)
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            coll.objects.link(obj)

            if s.export_glb:
                export_folder = os.path.join(bpy.path.abspath(s.export_dir), cat_lower)
                os.makedirs(export_folder, exist_ok=True)
                filepath = os.path.join(export_folder, name + '.glb')
                export_object_glb(obj, filepath)
                exported.append(filepath)

        bpy.data.orphans_purge(do_local_ids=True, do_recursive=True)

        bpy.ops.object.select_all(action='DESELECT')
        for obj in coll.objects:
            obj.select_set(True)
        if coll.objects:
            bpy.context.view_layer.objects.active = coll.objects[0]

        msg = f"Generated {s.variant_count} {cat_lower} variant(s) (modifiers are alive!)"
        if s.export_glb:
            msg += f", exported {len(exported)} baked GLB(s)"
        self.report({'INFO'}, msg)
        return {'FINISHED'}


class FIGHTERGEN_OT_export_selected(Operator):
    bl_idname = "fightergen.export_selected"
    bl_label = "Export Selected to GLB"
    bl_description = "Bake modifiers and export selected object into its category folder"
    bl_options = {'REGISTER'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        sel = [o for o in context.selected_objects if o.type == 'MESH']

        if not sel:
            coll = bpy.data.collections.get(VARIANT_COLLECTION)
            if coll is not None:
                sel = [o for o in coll.objects if o.type == 'MESH']

        if not sel:
            self.report({'WARNING'}, "No mesh objects selected.")
            return {'CANCELLED'}

        cat_lower = CATEGORY_FOLDERS[s.part_type]
        export_folder = os.path.join(bpy.path.abspath(s.export_dir), cat_lower)
        os.makedirs(export_folder, exist_ok=True)
        for obj in sel:
            filepath = os.path.join(export_folder, obj.name + '.glb')
            export_object_glb(obj, filepath)

        self.report({'INFO'}, f"Exported {len(sel)} baked GLB(s) to {export_folder}")
        return {'FINISHED'}


class FIGHTERGEN_OT_export_assembly_cocos(Operator):
    bl_idname = "fightergen.export_assembly_cocos"
    bl_label = "Export Assembly to Cocos"
    bl_description = ("Joins every part of the current assembly (or the selected objects, if any) into one "
                       "mesh and exports it as a single GLB into the Cocos project's assets/resources/Models "
                       "folder, so it shows up as one importable model instead of one file per part")
    bl_options = {'REGISTER'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        parts = [o for o in context.selected_objects if o.type == 'MESH']
        if not parts:
            coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
            if coll is not None:
                parts = [o for o in coll.objects if o.type == 'MESH']

        if not parts:
            self.report({'WARNING'}, "No mesh objects selected (and no FighterGen_Assembly to fall back to).")
            return {'CANCELLED'}

        export_folder = bpy.path.abspath(s.cocos_export_dir)
        os.makedirs(export_folder, exist_ok=True)
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'
        filepath = os.path.join(export_folder, name + '.glb')

        ok = export_assembly_glb(parts, filepath)
        if not ok:
            self.report({'ERROR'}, "Export failed -- no mesh geometry to export.")
            return {'CANCELLED'}

        self.report({'INFO'}, f"Exported {len(parts)} part(s) as one GLB to {filepath}")
        return {'FINISHED'}


class FIGHTERGEN_OT_apply_detail_pass(Operator):
    bl_idname = "fightergen.apply_detail_pass"
    bl_label = "Apply Detail Pass to Selected"
    bl_description = ("Adds the enabled Remesh(Blocks)/Remesh(Sharp)/Bevel/Wireframe-copy modifiers "
                       "to the currently selected object(s) only -- run this on a part you've already "
                       "chosen, not during batch generation, since voxel remeshing is expensive")
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        targets = [o for o in context.selected_objects if o.type == 'MESH']
        if not targets:
            self.report({'WARNING'}, "No mesh objects selected.")
            return {'CANCELLED'}
        if not (s.use_detail_remesh1 or s.use_detail_remesh2 or s.use_detail_bevel or s.use_wireframe_detail):
            self.report({'WARNING'}, "No detail-pass options are enabled.")
            return {'CANCELLED'}
        for obj in targets:
            _apply_detail_pass(obj, s)
        self.report({'INFO'}, f"Applied detail pass to {len(targets)} object(s)")
        return {'FINISHED'}


class FIGHTERGEN_OT_add_whole_ship_lattice(Operator):
    bl_idname = "fightergen.add_whole_ship_lattice"
    bl_label = "Add Whole-Ship Lattice"
    bl_description = ("Wraps every selected mesh part in a shared Lattice sized to their combined bounding "
                       "box and adds a Lattice modifier to each -- editing the lattice's control points "
                       "(Edit Mode) then reshapes the whole ship as one silhouette (stretch/taper/bend/twist) "
                       "while each part keeps its own generated detail intact")
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        parts = [o for o in context.selected_objects if o.type == 'MESH']
        if not parts:
            coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
            if coll is not None:
                parts = [o for o in coll.objects if o.type == 'MESH']
        if not parts:
            self.report({'WARNING'}, "No mesh objects selected (and no FighterGen_Assembly to fall back to).")
            return {'CANCELLED'}

        depsgraph = context.evaluated_depsgraph_get()
        corners = []
        for obj in parts:
            obj_eval = obj.evaluated_get(depsgraph)
            for c in obj_eval.bound_box:
                corners.append(obj_eval.matrix_world @ Vector(c))
        xs = [c.x for c in corners]; ys = [c.y for c in corners]; zs = [c.z for c in corners]
        center = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
        half_size = Vector((max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))) * (1.08 / 2.0)
        half_size = Vector((max(half_size.x, 0.05), max(half_size.y, 0.05), max(half_size.z, 0.05)))

        base_name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'
        lat_name = f"{base_name}_ship_lattice"
        if lat_name in bpy.data.objects:
            old = bpy.data.objects[lat_name]
            old_data = old.data
            bpy.data.objects.remove(old, do_unlink=True)
            if old_data and old_data.users == 0:
                bpy.data.lattices.remove(old_data)

        lat_data = bpy.data.lattices.new(lat_name + "_data")
        lat_data.points_u = 3  # X: left/right span
        lat_data.points_v = 5  # Y: fore/aft length -- extra resolution for tapering/bending along the hull
        lat_data.points_w = 3  # Z: up/down
        lat_obj = bpy.data.objects.new(lat_name, lat_data)
        lat_obj.location = center
        # A lattice's native point coordinates are spaced 1 unit apart centered on the
        # origin, so their extent scales with point COUNT -- e.g. 5 points span -2..+2,
        # not -1..+1 like 3 points does. Divide by that native half-extent per axis so
        # the lattice's actual world-space bounding box matches half_size regardless of
        # how many control points each axis has (verified empirically; assuming a fixed
        # -1..1 range regardless of point count was wrong and made Y-axis edits barely
        # move the wrapped geometry).
        native_half = Vector(((lat_data.points_u - 1) / 2.0, (lat_data.points_v - 1) / 2.0, (lat_data.points_w - 1) / 2.0))
        lat_obj.scale = Vector((half_size.x / native_half.x, half_size.y / native_half.y, half_size.z / native_half.z))
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION) or context.collection
        coll.objects.link(lat_obj)

        for obj in parts:
            mod = obj.modifiers.new("WholeShipLattice", 'LATTICE')
            mod.object = lat_obj

        bpy.ops.object.select_all(action='DESELECT')
        lat_obj.select_set(True)
        context.view_layer.objects.active = lat_obj

        self.report({'INFO'}, f"Added '{lat_name}' around {len(parts)} part(s) -- enter Edit Mode on it to reshape the whole ship")
        return {'FINISHED'}


class FIGHTERGEN_PT_panel(Panel):
    bl_label = "Fighter Part Generator"
    bl_idname = "FIGHTERGEN_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "FighterGen"

    def draw(self, context):
        layout = self.layout
        s = context.scene.fightergen_settings

        box = layout.box()
        box.label(text="Fighter Gen Settings")
        box.prop(s, 'part_type')
        box.prop(s, 'name_prefix')
        box.prop(s, 'variant_count')
        box.prop(s, 'spacing')
        box.prop(s, 'random_seed')

        # Coarse "what kind of thing" pickers stay visible and default to Random --
        # everything else is fine-tuning that's rarely touched (hand-edit the
        # generated object directly instead), so it's tucked behind Advanced below.
        if s.part_type == 'FUSELAGE':
            box.prop(s, 'fuselage_archetype')
        elif s.part_type == 'WEAPONS':
            box.prop(s, 'wp_type')

        mat_box = layout.box()
        mat_box.label(text="Material")
        mat_box.prop(s, 'metallic')
        mat_box.prop(s, 'primary_color')
        mat_box.prop(s, 'accent_glow_color')

        adv_box = layout.box()
        row = adv_box.row()
        row.prop(s, 'show_advanced', icon='TRIA_DOWN' if s.show_advanced else 'TRIA_RIGHT', icon_only=True, emboss=False)
        row.label(text="Advanced Parameters (random ranges, rarely needed)")

        if s.show_advanced:
            param_box = adv_box.box()
            param_box.label(text=f"{s.part_type.title()} Options (Random Range)")

            if s.part_type == 'FUSELAGE':
                row = param_box.row(align=True); row.prop(s, 'length_min'); row.prop(s, 'length_max')
                sub = param_box.column()
                sub.enabled = (s.fuselage_archetype == 'ORGANIC')
                sub.prop(s, 'profile_style')
                sub.prop(s, 'radius_point_count')
                sub.prop(s, 'height_point_count')
                row = param_box.row(align=True); row.prop(s, 'radius_floor'); row.prop(s, 'radius_ceiling')
                row = param_box.row(align=True); row.prop(s, 'height_floor'); row.prop(s, 'height_ceiling')
                row = param_box.row(align=True); row.prop(s, 'fuse_vpinch_min'); row.prop(s, 'fuse_vpinch_max')
                row = param_box.row(align=True); row.prop(s, 'sides_min'); row.prop(s, 'sides_max')
                param_box.prop(s, 'fuse_subdiv')

                groove_box = adv_box.box()
                groove_box.label(text="Panel lines (Fuselage Only)")
                row = groove_box.row(align=True); row.prop(s, 'groove_count_min'); row.prop(s, 'groove_count_max')
                row = groove_box.row(align=True); row.prop(s, 'groove_spread_deg_min'); row.prop(s, 'groove_spread_deg_max')
                row = groove_box.row(align=True); row.prop(s, 'groove_center_deg_min'); row.prop(s, 'groove_center_deg_max')
                row = groove_box.row(align=True); row.prop(s, 'groove_width_min'); row.prop(s, 'groove_width_max')
                row = groove_box.row(align=True); row.prop(s, 'groove_y_frac_min'); row.prop(s, 'groove_y_frac_max')

            elif s.part_type in ('WINGS', 'TAILS'):
                row = param_box.row(align=True); row.prop(s, 'wing_span_min'); row.prop(s, 'wing_span_max')
                row = param_box.row(align=True); row.prop(s, 'wing_root_min'); row.prop(s, 'wing_root_max')
                row = param_box.row(align=True); row.prop(s, 'wing_tip_min'); row.prop(s, 'wing_tip_max')
                row = param_box.row(align=True); row.prop(s, 'wing_sweep_min'); row.prop(s, 'wing_sweep_max')
                row = param_box.row(align=True); row.prop(s, 'wing_thick_min'); row.prop(s, 'wing_thick_max')
                row = param_box.row(align=True); row.prop(s, 'wing_thick_mid_min'); row.prop(s, 'wing_thick_mid_max')
                row = param_box.row(align=True); row.prop(s, 'wing_root_thick_min'); row.prop(s, 'wing_root_thick_max')
                row = param_box.row(align=True); row.prop(s, 'wing_tip_thick_min'); row.prop(s, 'wing_tip_thick_max')
                row = param_box.row(align=True); row.prop(s, 'wing_dihedral_min'); row.prop(s, 'wing_dihedral_max')
                row = param_box.row(align=True); row.prop(s, 'wing_twist_min'); row.prop(s, 'wing_twist_max')
                row = param_box.row(align=True); row.prop(s, 'wing_sharp_min'); row.prop(s, 'wing_sharp_max')
                param_box.prop(s, 'wing_subdiv')

            elif s.part_type == 'ENGINES':
                row = param_box.row(align=True); row.prop(s, 'eng_len_min'); row.prop(s, 'eng_len_max')
                row = param_box.row(align=True); row.prop(s, 'eng_rad_min'); row.prop(s, 'eng_rad_max')
                row = param_box.row(align=True); row.prop(s, 'eng_ex_min'); row.prop(s, 'eng_ex_max')
                row = param_box.row(align=True); row.prop(s, 'eng_roundness_min'); row.prop(s, 'eng_roundness_max')
                row = param_box.row(align=True); row.prop(s, 'eng_stripes_min'); row.prop(s, 'eng_stripes_max')
                row = param_box.row(align=True); row.prop(s, 'eng_twist_min'); row.prop(s, 'eng_twist_max')
                param_box.prop(s, 'eng_subdiv')

            elif s.part_type == 'CANOPY':
                row = param_box.row(align=True); row.prop(s, 'canopy_len_min'); row.prop(s, 'canopy_len_max')
                row = param_box.row(align=True); row.prop(s, 'canopy_width_min'); row.prop(s, 'canopy_width_max')
                row = param_box.row(align=True); row.prop(s, 'canopy_height_min'); row.prop(s, 'canopy_height_max')
                row = param_box.row(align=True); row.prop(s, 'canopy_teardrop_min'); row.prop(s, 'canopy_teardrop_max')
                row = param_box.row(align=True); row.prop(s, 'canopy_stretch_min'); row.prop(s, 'canopy_stretch_max')
                param_box.prop(s, 'canopy_subdiv')

            elif s.part_type == 'WEAPONS':
                row = param_box.row(align=True); row.prop(s, 'wp_len_min'); row.prop(s, 'wp_len_max')
                row = param_box.row(align=True); row.prop(s, 'wp_rad_min'); row.prop(s, 'wp_rad_max')
                row = param_box.row(align=True); row.prop(s, 'wp_barrel_min'); row.prop(s, 'wp_barrel_max')
                if s.wp_type in ('CANNON', 'RANDOM'):
                    row = param_box.row(align=True); row.prop(s, 'wp_muzzle_min'); row.prop(s, 'wp_muzzle_max')

            if s.part_type in ('FUSELAGE', 'WINGS', 'TAILS', 'ENGINES'):
                post_box = adv_box.box()
                post_box.label(text="Bevel Modifiers")
                post_box.prop(s, 'bevel_width')
                post_box.prop(s, 'bevel_angle_deg')

            finish_box = adv_box.box()
            finish_box.label(text="Finishing Modifiers (live, hand-editable after Generate)")
            row = finish_box.row(align=True); row.prop(s, 'use_remesh'); row.prop(s, 'remesh_octree_depth')
            row = finish_box.row(align=True); row.prop(s, 'use_solidify'); row.prop(s, 'solidify_thickness')
            row = finish_box.row(align=True); row.prop(s, 'use_bend'); row.prop(s, 'bend_angle_deg')
            finish_box.prop(s, 'use_twist')
            row = finish_box.row(align=True); row.prop(s, 'twist_angle_min'); row.prop(s, 'twist_angle_max')
            finish_box.prop(s, 'use_taper')
            row = finish_box.row(align=True); row.prop(s, 'taper_factor_min'); row.prop(s, 'taper_factor_max')

            assemble_adv_box = adv_box.box()
            assemble_adv_box.label(text="Assembly wing-attach range")
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_wing_attach_min'); row.prop(s, 'assemble_wing_attach_max')
            assemble_adv_box.prop(s, 'assemble_wing_overlap')
            assemble_adv_box.separator()
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_subwing_attach_min'); row.prop(s, 'assemble_subwing_attach_max')
            assemble_adv_box.prop(s, 'assemble_subwing_scale')
            assemble_adv_box.separator()
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_aileron_span_frac_min'); row.prop(s, 'assemble_aileron_span_frac_max')
            assemble_adv_box.prop(s, 'assemble_aileron_size_scale')
            assemble_adv_box.separator()
            assemble_adv_box.prop(s, 'assemble_engine_pod_count')
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_engine_pod_span_frac_min'); row.prop(s, 'assemble_engine_pod_span_frac_max')
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_engine_pod_length_min'); row.prop(s, 'assemble_engine_pod_length_max')
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_engine_pod_radius_min'); row.prop(s, 'assemble_engine_pod_radius_max')
            assemble_adv_box.separator()
            row = assemble_adv_box.row(align=True); row.prop(s, 'assemble_wing_weapon_span_frac_min'); row.prop(s, 'assemble_wing_weapon_span_frac_max')

        layout.operator('fightergen.generate_variants', icon='MOD_ARRAY')

        assemble_box = layout.box()
        assemble_box.label(text="🔧 Assembly (Raycast Fitted)")
        assemble_box.label(text="Full Ship Integration: Fuselage + Wings + Tails + Canopy")
        row = assemble_box.row(align=True)
        row.prop(s, 'assemble_subwing_enable')
        row.prop(s, 'assemble_tail_enable')
        row = assemble_box.row(align=True)
        row.prop(s, 'assemble_canopy_enable')
        row.prop(s, 'assemble_aileron_enable')
        row = assemble_box.row(align=True)
        row.prop(s, 'assemble_engine_pod_enable')
        row.prop(s, 'assemble_wing_weapon_enable')
        assemble_box.operator('fightergen.assemble_fighter', icon='MOD_BOOLEAN')
        row = assemble_box.row(align=True)
        row.operator('fightergen.reroll_main_wing', icon='FILE_REFRESH', text="Reroll Wing")
        row.operator('fightergen.reroll_sub_wing', icon='FILE_REFRESH', text="Reroll Sub-Wing")
        row = assemble_box.row(align=True)
        row.operator('fightergen.reroll_tail', icon='FILE_REFRESH', text="Reroll Tail")
        row.operator('fightergen.reroll_canopy', icon='FILE_REFRESH', text="Reroll Canopy")
        row = assemble_box.row(align=True)
        row.operator('fightergen.reroll_engine_pods', icon='FILE_REFRESH', text="Reroll Engine Pod(s)")
        row.operator('fightergen.reroll_wing_weapon', icon='FILE_REFRESH', text="Reroll Wing Weapon")

        detail_box = layout.box()
        detail_box.label(text="Detail Pass (applies to selected object(s) only)")
        detail_box.label(text="Not run during batch generation -- voxel remesh is expensive", icon='INFO')
        row = detail_box.row(align=True)
        row.prop(s, 'use_detail_remesh1')
        row.prop(s, 'detail_remesh1_octree_min'); row.prop(s, 'detail_remesh1_octree_max')
        row = detail_box.row(align=True)
        row.prop(s, 'use_detail_remesh2')
        row.prop(s, 'detail_remesh2_octree_min'); row.prop(s, 'detail_remesh2_octree_max')
        row = detail_box.row(align=True)
        row.prop(s, 'use_detail_bevel')
        row.prop(s, 'detail_bevel_width'); row.prop(s, 'detail_bevel_angle_deg')
        row = detail_box.row(align=True)
        row.prop(s, 'use_wireframe_detail')
        row.prop(s, 'wireframe_thickness'); row.prop(s, 'wireframe_offset')
        detail_box.operator('fightergen.apply_detail_pass', icon='MOD_REMESH')

        lattice_box = layout.box()
        lattice_box.label(text="Whole-Ship Reshape")
        lattice_box.label(text="Select the parts to wrap (or leave none for the whole Assembly)", icon='INFO')
        lattice_box.operator('fightergen.add_whole_ship_lattice', icon='MOD_LATTICE')

        export_box = layout.box()
        export_box.label(text="Export")
        export_box.prop(s, 'export_glb')
        export_box.prop(s, 'export_dir')
        export_box.operator('fightergen.export_selected', icon='EXPORT')
        export_box.separator()
        export_box.label(text="Cocos Creator (whole assembly -> one GLB)")
        export_box.prop(s, 'cocos_export_dir')
        export_box.operator('fightergen.export_assembly_cocos', icon='EXPORT')


# ---------------------------------------------------------------------------
# Assembly: fuselage + main wing, joined by geometry instead of a generic
# bounding-box guess. The fuselage's actual hull surface is sampled by
# raycasting in its own local space, so the wing root always sits flush
# against the real hull regardless of how the randomized profile came out.
# ---------------------------------------------------------------------------

def sample_hull_offset(obj, y, direction, max_dist=50.0):
    """Raycast in `obj`'s own local space to find how far its surface is from the
    centerline (0, y, 0) along `direction`. Returns (offset_distance, hit_normal),
    or (None, None) if the ray missed (e.g. y outside the object's extent)."""
    direction = direction.normalized()
    origin = Vector((0.0, y, 0.0)) - direction * max_dist
    success, hit_loc, hit_normal, hit_idx = obj.ray_cast(origin, direction, distance=max_dist * 2)
    if not success:
        return None, None
    offset = (hit_loc - Vector((0.0, y, 0.0))).length
    return offset, hit_normal


def _generate_wing_pair(rng, name_prefix, part_label, s, mat_base, fuselage_obj, fuselage_length,
                         attach_min, attach_max, size_scale=1.0, sweep_floor_frac=0.0):
    """Builds ONE wing GN part on the +X side, anchored to the fuselage's actual raycasted
    hull surface, then adds a live Mirror modifier (mirrored around the fuselage object's
    own origin, i.e. the true centerline) so the left half is not a separate baked copy --
    it is generated by the modifier every time the mesh or the transform of this single
    object changes. Finishing modifiers (Remesh/Solidify/Bend/Twist/Taper) are applied
    BEFORE the Mirror modifier is added, to this single (pre-mirror) side only: Twist and
    Taper deform based on the current mesh's own bounding box, and that box is only
    centered on the true mirror plane if computed before mirroring -- doing it after
    made the two sides look lopsided instead of true mirror images.
    `size_scale` multiplies span/chord/sweep so a smaller companion (e.g. a sub-wing)
    can reuse the exact same random ranges as the main wing, just scaled down.
    `sweep_floor_frac` (0..1) raises the sampled Sweep's lower bound to that fraction of
    wing_sweep_max -- without it, a sub-wing occasionally draws a near-parallel/low-sweep
    angle close to the main wing's own, which reads as two redundant, overlapping blades
    instead of a distinct swept-back canard."""
    template = build_wings_template()
    sweep_raw = _rr(rng, s.wing_sweep_min, s.wing_sweep_max)
    if sweep_floor_frac > 0.0:
        sweep_raw = max(sweep_raw, s.wing_sweep_max * sweep_floor_frac)
    attach_frac = _rr(rng, attach_min, attach_max)
    attach_y = fuselage_length * attach_frac
    radius_x, _normal = sample_hull_offset(fuselage_obj, attach_y, Vector((1.0, 0.0, 0.0)))
    if radius_x is None:
        radius_x = 0.25 * size_scale

    root_x = radius_x * s.assemble_wing_overlap

    p = {
        'Span': _rr(rng, s.wing_span_min, s.wing_span_max) * size_scale,
        'RootChord': _rr(rng, s.wing_root_min, s.wing_root_max) * size_scale,
        'TipChord': _rr(rng, s.wing_tip_min, s.wing_tip_max) * size_scale,
        'Sweep': sweep_raw * size_scale,
        'Thickness': _rr(rng, s.wing_thick_min, s.wing_thick_max),
        'ThicknessMid': _rr(rng, s.wing_thick_mid_min, s.wing_thick_mid_max),
        'RootThickness': _rr(rng, s.wing_root_thick_min, s.wing_root_thick_max),
        'TipThickness': _rr(rng, s.wing_tip_thick_min, s.wing_tip_thick_max),
        'Dihedral': _rr(rng, s.wing_dihedral_min, s.wing_dihedral_max),
        'Twist': _rr(rng, s.wing_twist_min, s.wing_twist_max),
        'AirfoilSharpness': _rr(rng, s.wing_sharp_min, s.wing_sharp_max),
        'LeadingEdgeMid': rng.uniform(0.0, 0.5),
        'TrailingEdgeMid': rng.uniform(0.0, 0.5),
        'RootOffset': root_x,
        'Subdivision': s.wing_subdiv,
    }
    wing = _finish_gn_object(f"{name_prefix}_{part_label}_r", template, p, mat_base=mat_base)
    _apply_bevel(wing, s)
    add_optional_modifiers(wing, s, rng, 'X')

    # Origin at (0, attach_y, 0) on the centerline so MirrorToLeft and Rotation Y fold symmetrically
    wing.location = (0.0, attach_y, 0.0)
    wing.scale = (1.0, 1.0, 1.0)

    mirror_mod = wing.modifiers.new("MirrorToLeft", 'MIRROR')
    mirror_mod.use_axis[0] = True
    mirror_mod.use_axis[1] = False
    mirror_mod.use_axis[2] = False
    mirror_mod.mirror_object = fuselage_obj
    mirror_mod.use_clip = False

    return wing, attach_y, p['Span']


def _generate_main_wing(rng, name_prefix, s, mat_base, fuselage_obj, fuselage_length):
    return _generate_wing_pair(rng, name_prefix, 'wing', s, mat_base, fuselage_obj, fuselage_length,
                                s.assemble_wing_attach_min, s.assemble_wing_attach_max, size_scale=1.0)


def _generate_sub_wing(rng, name_prefix, s, mat_base, fuselage_obj, fuselage_length):
    return _generate_wing_pair(rng, name_prefix, 'subwing', s, mat_base, fuselage_obj, fuselage_length,
                                s.assemble_subwing_attach_min, s.assemble_subwing_attach_max,
                                size_scale=s.assemble_subwing_scale, sweep_floor_frac=0.6)


def sample_wing_trailing_edge(wing_obj, x_local, max_dist=50.0):
    """Raycast in `wing_obj`'s own local space (post-modifiers, so Twist/Taper/Bevel are
    accounted for) to find its trailing-edge surface at span position x_local.
    Returns (hit_loc, hit_normal) or (None, None) if the ray missed.
    Tries multiple Z-offsets to handle strong Twist/Dihedral where Z=0 ray might miss the mesh."""
    direction = Vector((0.0, 1.0, 0.0))
    # Try Z offsets: 0, +0.2*span, -0.2*span, +0.5*span, -0.5*span if needed
    z_offsets = [0.0, 0.1, -0.1, 0.3, -0.3, 0.6, -0.6]
    for z_off in z_offsets:
        origin = Vector((x_local, 0.0, z_off)) - direction * max_dist
        success, hit_loc, hit_normal, hit_idx = wing_obj.ray_cast(origin, direction, distance=max_dist * 2)
        if success:
            return hit_loc, hit_normal
    return None, None


def _generate_aileron(rng, name_prefix, part_label, s, mat_base, fuselage_obj, parent_wing_obj, parent_span):
    """Small flat control-surface flap mounted on `parent_wing_obj`'s trailing edge,
    raycasted against the parent's own (already twisted/tapered) evaluated surface.
    Mirrored around the fuselage centerline exactly like the wing/sub-wing themselves."""
    template = build_wings_template()
    scale = s.assemble_aileron_size_scale
    p = {
        'Span': _rr(rng, s.wing_span_min, s.wing_span_max) * scale,
        'RootChord': _rr(rng, s.wing_root_min, s.wing_root_max) * scale,
        'TipChord': _rr(rng, s.wing_tip_min, s.wing_tip_max) * scale,
        'Sweep': 0.0,
        'Thickness': _rr(rng, s.wing_thick_min, s.wing_thick_max) * 0.6,
        'ThicknessMid': 0.0,
        'RootThickness': 0.6,
        'TipThickness': 0.6,
        'Dihedral': 0.0,
        'Twist': 0.0,
        'AirfoilSharpness': 1.2,
        'LeadingEdgeMid': 0.0,
        'TrailingEdgeMid': 0.0,
        'Subdivision': s.wing_subdiv,
    }
    aileron = _finish_gn_object(f"{name_prefix}_{part_label}_r", template, p, mat_base=mat_base)
    _apply_bevel(aileron, s)
    add_optional_modifiers(aileron, s, rng, 'X')

    # Target position along span. The wing template is single-sided (X spans 0 at the
    # root to -parent_span at the tip; the +X "outward" direction only appears after
    # the wing object's own scale.x=-1 flip), mirrored back to the other side by the
    # wing's own MirrorToLeft modifier -- so this samples the full parent_span range.
    span_frac = _rr(rng, s.assemble_aileron_span_frac_min, s.assemble_aileron_span_frac_max)
    x_center = -parent_span * span_frac

    # Multi-point sampling along the trailing edge around x_center
    delta = max(parent_span * 0.04, 0.02)
    sample_offsets = [0.0, -delta, delta, -2.0 * delta, 2.0 * delta]
    hits = []  # list of (x_local, hit_loc_world, hit_norm_world)

    for off in sample_offsets:
        x_loc = x_center + off
        # Clamp within valid wing span [-parent_span * 0.98, -parent_span * 0.02]
        x_loc_clamped = max(min(x_loc, -parent_span * 0.02), -parent_span * 0.98)
        hit_loc, hit_norm = sample_wing_trailing_edge(parent_wing_obj, x_loc_clamped)
        if hit_loc is not None:
            w_loc = parent_wing_obj.matrix_world @ hit_loc
            w_norm = (parent_wing_obj.matrix_world.to_3x3() @ hit_norm).normalized()
            hits.append((x_loc_clamped, w_loc, w_norm))

    if hits:
        # Sort by span position (most inboard to most outboard, i.e. x_local near 0 to near -parent_span)
        hits.sort(key=lambda item: item[0], reverse=True)  # since x is negative, reverse=True puts inboard (e.g. -0.2) first, outboard (e.g. -0.8) second
        
        # Primary position is the hit closest to center
        main_hit = min(hits, key=lambda item: abs(item[0] - x_center))
        hit_world = main_hit[1]

        # Calculate tangent along trailing edge (outboard direction: from inboard hit to outboard hit)
        if len(hits) >= 2:
            inboard_pt = hits[0][1]
            outboard_pt = hits[-1][1]
            tangent = (outboard_pt - inboard_pt)
            if tangent.length < 1e-6:
                tangent = (parent_wing_obj.matrix_world.to_3x3() @ Vector((-1.0, 0.0, 0.0))).normalized()
            else:
                tangent = tangent.normalized()
        else:
            tangent = (parent_wing_obj.matrix_world.to_3x3() @ Vector((-1.0, 0.0, 0.0))).normalized()

        # Average normal
        avg_normal = Vector((0.0, 0.0, 0.0))
        for h in hits:
            avg_normal += h[2]
        if avg_normal.length > 1e-6:
            normal = avg_normal.normalized()
        else:
            normal = (parent_wing_obj.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()

        # Construct full 3D orthonormal basis:
        # X = tangent (outboard along trailing edge)
        # Z = normal (perpendicular to wing surface)
        # Y = normal.cross(tangent) (forward along wing chord)
        chord_vec = normal.cross(tangent)
        if chord_vec.length > 1e-6:
            chord_vec = chord_vec.normalized()
            # Re-orthonormalize normal
            normal = tangent.cross(chord_vec).normalized()
            rot_mat = Matrix((tangent, chord_vec, normal)).transposed()
            aileron_rot = rot_mat.to_euler()
        else:
            angle_z = math.atan2(tangent.y, tangent.x)
            aileron_rot = Euler((0.0, 0.0, angle_z))
    else:
        # Fallback if all raycasts failed: align roughly with wing world transform
        hit_local = Vector((x_center, -parent_span * 0.2, 0.0))
        hit_world = parent_wing_obj.matrix_world @ hit_local
        aileron_rot = parent_wing_obj.matrix_world.to_euler()

    aileron.location = hit_world
    aileron.rotation_euler = aileron_rot
    aileron.scale = (1.0, 1.0, 1.0)

    mirror_mod = aileron.modifiers.new("MirrorToLeft", 'MIRROR')
    mirror_mod.use_axis[0] = True
    mirror_mod.use_axis[1] = False
    mirror_mod.use_axis[2] = False
    mirror_mod.mirror_object = fuselage_obj
    mirror_mod.use_clip = False

    return aileron


def sample_wing_underside(wing_obj, x_local, y_local, max_dist=50.0):
    """Raycast in `wing_obj`'s own local space to find its BOTTOM surface at a given
    span/chord position. Approaches from far below traveling upward (+Z) so the
    underside is the first surface hit, instead of passing through it to the top."""
    direction = Vector((0.0, 0.0, 1.0))
    origin = Vector((x_local, y_local, 0.0)) - direction * max_dist
    success, hit_loc, hit_normal, hit_idx = wing_obj.ray_cast(origin, direction, distance=max_dist * 2)
    if not success:
        return None, None
    return hit_loc, hit_normal


def _engine_pod_span_fracs(rng, s):
    """1 pod -> a single random position; 2 pods -> one in each half of the position
    range (inboard/outboard) so they don't land on top of each other."""
    lo, hi = sorted((s.assemble_engine_pod_span_frac_min, s.assemble_engine_pod_span_frac_max))
    if s.assemble_engine_pod_count <= 1:
        return [rng.uniform(lo, hi)]
    mid = (lo + hi) / 2.0
    return [rng.uniform(lo, mid), rng.uniform(mid, hi)]


def _generate_engine_pod(rng, name_prefix, part_label, s, mat_base, mat_glow, fuselage_obj, parent_wing_obj, parent_span, span_frac):
    """A plain cylindrical jet nacelle hung under parent_wing_obj at a given span
    fraction, raycast-attached flush to the wing's real underside (not a guessed
    offset). Its own Length axis stays aligned with the aircraft's forward direction
    (world Y) rather than following wing sweep -- engines point forward, not along
    whatever angle the wing happens to be swept at. Mirrored around the fuselage
    centerline like the wing itself."""
    template = build_jet_nacelle_template()
    length = _rr(rng, s.assemble_engine_pod_length_min, s.assemble_engine_pod_length_max)
    radius = _rr(rng, s.assemble_engine_pod_radius_min, s.assemble_engine_pod_radius_max)
    p = {
        'Length': length,
        'Radius': radius,
        'ExhaustRadius': radius * _rr(rng, 0.6, 0.85),
        'Sides': 14,
    }
    pod = _finish_gn_object(f"{name_prefix}_{part_label}_r", template, p, mat_base=mat_base, mat_glow=mat_glow)

    x_local = -parent_span * span_frac
    # Sample near mid-chord (y_local=0 in the wing's own chord-centered space)
    hit_local, _hit_normal = sample_wing_underside(parent_wing_obj, x_local, 0.0)
    if hit_local is None:
        hit_world = parent_wing_obj.matrix_world @ Vector((x_local, 0.0, -0.1))
    else:
        hit_world = parent_wing_obj.matrix_world @ hit_local

    # Hang the pod below the wing surface by its own radius plus a small gap, so it
    # reads as flush-mounted underneath rather than floating or clipping through.
    pod.location = hit_world + Vector((0.0, 0.0, -(radius + 0.02)))
    # NOT _orient_forward() here: a jet nacelle's narrow end (the exhaust) is supposed
    # to face BACKWARD by design, the opposite of the "narrow end = forward-facing
    # tip" assumption _orient_forward relies on. build_jet_nacelle_template already
    # puts the exhaust at local +Y (aft) intentionally, so identity rotation is correct.
    pod.rotation_euler = (0.0, 0.0, 0.0)
    pod.scale = (1.0, 1.0, 1.0)

    mirror_mod = pod.modifiers.new("MirrorToLeft", 'MIRROR')
    mirror_mod.use_axis[0] = True
    mirror_mod.use_axis[1] = False
    mirror_mod.use_axis[2] = False
    mirror_mod.mirror_object = fuselage_obj
    mirror_mod.use_clip = False

    return pod


def sample_wing_topside(wing_obj, x_local, y_local, max_dist=50.0):
    """Raycast in `wing_obj`'s own local space to find its TOP surface at a given
    span/chord position. Approaches from far above traveling downward (-Z) so the
    top is the first surface hit, instead of passing through it to the underside."""
    direction = Vector((0.0, 0.0, -1.0))
    origin = Vector((x_local, y_local, 0.0)) - direction * max_dist
    success, hit_loc, hit_normal, hit_idx = wing_obj.ray_cast(origin, direction, distance=max_dist * 2)
    if not success:
        return None, None
    return hit_loc, hit_normal


# Confirmed empirically (test_orientation_check2.py): the fuselage's nose sits at
# local Y=0 and the hull widens toward +Y as it runs aft to the tail. So for the
# ASSEMBLED SHIP specifically, "forward" is -Y -- not the same thing as the general
# per-part "Length runs along Y" convention, which says nothing about which end of
# that Y range is the front. Templates built at different times (weapons vs. the
# nacelle built this session) turned out to disagree on which of their own ends is
# the "business end" pointing towards +Y vs -Y, which is how the wing weapon ended up
# facing backward. Rather than re-deriving each new template's convention by hand
# (and getting it wrong again), measure it automatically.
def _needs_forward_flip(obj, forward_sign=-1.0):
    """True if `obj`'s geometry needs a 180-degree Z rotation so its narrower/tapered
    end faces `forward_sign` * local Y (default -Y, the ship's forward direction)
    instead of the opposite end. Measures the object's OWN current mesh, so it
    self-corrects regardless of which way any individual template happens to have
    been built -- no more re-deriving a new template's local "front" by hand.

    CAVEAT: this assumes the narrow/tapered end IS the forward-facing tip, which
    holds for most pointed add-ons (weapon muzzles, probes, spikes, noses) but is
    WRONG for parts that are deliberately narrower at the REAR, like a jet nacelle
    (exhaust < intake) -- for those, set rotation explicitly instead and say why,
    see _generate_engine_pod."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(depsgraph)
    mesh = obj_eval.to_mesh()
    verts = [v.co for v in mesh.vertices if abs(v.co.y) < 1000.0 and (v.co.x ** 2 + v.co.z ** 2) < 1000.0]
    obj_eval.to_mesh_clear()
    if len(verts) < 8:
        return False
    ys = [v.y for v in verts]
    y_min, y_max = min(ys), max(ys)
    if y_max - y_min < 1e-6:
        return False
    band = (y_max - y_min) * 0.15
    near_min = [math.sqrt(v.x ** 2 + v.z ** 2) for v in verts if v.y < y_min + band]
    near_max = [math.sqrt(v.x ** 2 + v.z ** 2) for v in verts if v.y > y_max - band]
    if not near_min or not near_max:
        return False
    avg_min = sum(near_min) / len(near_min)
    avg_max = sum(near_max) / len(near_max)
    tip_is_positive_y = avg_max < avg_min
    wants_positive_y = forward_sign > 0
    return tip_is_positive_y != wants_positive_y


def _orient_forward(obj, forward_sign=-1.0):
    """Rotates `obj` 180 degrees around Z if needed so its tapered end faces the
    ship's forward direction, per _needs_forward_flip. Call this instead of hardcoding
    rotation_euler=(0,0,0) on any newly-attached part that should face forward."""
    if _needs_forward_flip(obj, forward_sign):
        obj.rotation_euler = (0.0, 0.0, math.pi)
    else:
        obj.rotation_euler = (0.0, 0.0, 0.0)


def _generate_wing_weapon(rng, name_prefix, part_label, s, mat_base, mat_glow, fuselage_obj, parent_wing_obj, parent_span, span_frac):
    """A weapon (Cannon/Gatling/Railgun, same random ranges as the standalone WEAPONS
    category) mounted on TOP of parent_wing_obj at a given span fraction, raycast-
    flush to the wing's real upper surface. Barrel stays aligned with the aircraft's
    forward axis (world Y), not wing sweep. Mirrored around the fuselage centerline,
    so the same weapon appears on both wings."""
    length = _rr(rng, s.wp_len_min, s.wp_len_max)
    radius = _rr(rng, s.wp_rad_min, s.wp_rad_max)
    barrel_ratio = _rr(rng, s.wp_barrel_min, s.wp_barrel_max)

    wp_type = s.wp_type
    if wp_type == 'RANDOM':
        wp_type = rng.choice(_WEAPON_TYPE_CHOICES)

    if wp_type == 'CANNON':
        template = build_cannon_template()
        p = {'Length': length, 'Radius': radius, 'BarrelLength': barrel_ratio,
             'MuzzleWidth': _rr(rng, s.wp_muzzle_min, s.wp_muzzle_max)}
    elif wp_type == 'GATLING':
        template = build_gatling_template()
        p = {'Length': length, 'Radius': radius, 'BarrelLength': barrel_ratio}
    else:
        template = build_railgun_template()
        p = {'Length': length, 'Radius': radius, 'BarrelLength': barrel_ratio}

    weapon = _finish_gn_object(f"{name_prefix}_{part_label}_r", template, p, mat_base=mat_base, mat_glow=mat_glow)

    x_local = -parent_span * span_frac
    hit_local, _hit_normal = sample_wing_topside(parent_wing_obj, x_local, 0.0)
    if hit_local is None:
        hit_world = parent_wing_obj.matrix_world @ Vector((x_local, 0.0, 0.1))
    else:
        hit_world = parent_wing_obj.matrix_world @ hit_local

    # Sit the weapon on top of the wing surface by its own radius plus a small gap,
    # so it reads as flush-mounted on top rather than floating or clipping through.
    weapon.location = hit_world + Vector((0.0, 0.0, radius + 0.02))
    _orient_forward(weapon)
    weapon.scale = (1.0, 1.0, 1.0)

    mirror_mod = weapon.modifiers.new("MirrorToLeft", 'MIRROR')
    mirror_mod.use_axis[0] = True
    mirror_mod.use_axis[1] = False
    mirror_mod.use_axis[2] = False
    mirror_mod.mirror_object = fuselage_obj
    mirror_mod.use_clip = False

    return weapon


def _generate_tail_assembly(rng, name_prefix, s, mat_base, fuselage_obj, fuselage_length):
    """Raycast-attaches a tail pair to the aft hull section of fuselage_obj,
    scaled proportionally to fuselage length, with origin at X=0 for symmetric folding."""
    template = build_tails_template()
    attach_y = fuselage_length * _rr(rng, s.assemble_tail_y_frac_min, s.assemble_tail_y_frac_max)

    direction = Vector((0.4, 0.0, 0.9)).normalized()
    radius_offset, hit_normal = sample_hull_offset(fuselage_obj, attach_y, direction)
    if radius_offset is None:
        radius_offset = 0.35

    root_x = radius_offset * direction.x * s.assemble_wing_overlap
    root_z = radius_offset * direction.z * s.assemble_wing_overlap

    tail_span = fuselage_length * _rr(rng, 0.14, 0.22)
    tail_root = fuselage_length * _rr(rng, 0.08, 0.12)
    tail_tip = tail_root * _rr(rng, 0.35, 0.55)

    # NOTE: Sweep parameter is in METERS (trailing-edge setback at tip), NOT degrees.
    # wing_sweep_max defaults to 1.2m. Tail uses fuselage-proportional values.
    tail_sweep = tail_root * _rr(rng, 0.4, 1.0)

    p = {
        'Span': tail_span,
        'RootChord': tail_root,
        'TipChord': tail_tip,
        'Sweep': tail_sweep,
        'Thickness': tail_root * 0.12,
        'ThicknessMid': 0.0,
        'RootThickness': 0.8,
        'TipThickness': 0.5,
        'Dihedral': _rr(rng, 30.0, 65.0),  # in degrees (converted RADIANS→TAN in template)
        'Twist': 0.0,
        'AirfoilSharpness': 1.2,
        'LeadingEdgeMid': 0.0,
        'TrailingEdgeMid': 0.0,
        'RootOffset': root_x,
        'Subdivision': s.wing_subdiv,
    }

    tail = _finish_gn_object(f"{name_prefix}_tail_r", template, p, mat_base=mat_base)
    _apply_bevel(tail, s)
    add_optional_modifiers(tail, s, rng, 'Z')  # tails span along Z (build_tails_template), not X like wings

    # Origin at X=0 on the centerline so MirrorToLeft and Rotation Y fold symmetrically
    tail.location = (0.0, attach_y, root_z)
    tail.scale = (1.0, 1.0, 1.0)

    mirror_mod = tail.modifiers.new("MirrorToLeft", 'MIRROR')
    mirror_mod.use_axis[0] = True
    mirror_mod.use_axis[1] = False
    mirror_mod.use_axis[2] = False
    mirror_mod.mirror_object = fuselage_obj
    mirror_mod.use_clip = False

    return tail, attach_y


def _generate_canopy_assembly(rng, name_prefix, s, mat_base, fuselage_obj, fuselage_length):
    """Raycast-attaches a cockpit canopy to the upper forward hull surface of fuselage_obj,
    scaled proportionally to the fuselage's length and actual hull width."""
    template = build_canopy_template()
    attach_y = fuselage_length * _rr(rng, s.assemble_canopy_y_frac_min, s.assemble_canopy_y_frac_max)

    hull_offset, _norm = sample_hull_offset(fuselage_obj, attach_y, Vector((1.0, 0.0, 0.0)))
    if hull_offset is None:
        hull_offset = 0.40

    # Mesh UV sphere diameter is 2.0, so multiply radius by 0.5
    canopy_len = (fuselage_length * _rr(rng, 0.15, 0.22)) * 0.5
    canopy_width = ((hull_offset * 2.0) * _rr(rng, 0.50, 0.75)) * 0.5
    canopy_height = canopy_width * _rr(rng, 0.45, 0.65)

    p = {
        'Length': canopy_len,
        'Width': canopy_width,
        'Height': canopy_height,
        'Teardrop': _rr(rng, s.canopy_teardrop_min, s.canopy_teardrop_max),
        'Stretch': _rr(rng, s.canopy_stretch_min, s.canopy_stretch_max),
        'Subdivision': s.canopy_subdiv,
    }

    direction = Vector((0.0, 0.0, -1.0))
    origin = Vector((0.0, attach_y, 50.0))
    success, hit_loc, hit_normal, hit_idx = fuselage_obj.ray_cast(origin, direction, distance=100.0)

    if success:
        attach_pos = hit_loc
    else:
        attach_pos = Vector((0.0, attach_y, 0.35))

    mat_canopy = make_material('FighterGen_Canopy', (0.12, 0.22, 0.35, 0.65), roughness=0.08, metallic=0.90)
    canopy = _finish_gn_object(f"{name_prefix}_canopy", template, p, mat_base=mat_canopy)
    _apply_bevel(canopy, s)
    add_optional_modifiers(canopy, s, rng, 'Y')

    canopy.location = attach_pos
    canopy.scale = (1.0, 1.0, 1.0)
    return canopy, attach_y


def _clear_assembly_collection():
    coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
    if coll is None:
        coll = bpy.data.collections.new(ASSEMBLY_COLLECTION)
        bpy.context.scene.collection.children.link(coll)
        return coll
    for obj in list(coll.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    return coll


class FIGHTERGEN_OT_assemble(Operator):
    bl_idname = "fightergen.assemble_fighter"
    bl_label = "Assemble Fighter (Fuselage + Main Wing)"
    bl_description = "Generate a fuselage and a main wing pair whose root is fitted to the actual hull surface (raycast), not a generic offset guess"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        rng = random.Random(s.random_seed if s.random_seed != 0 else None)
        coll = _clear_assembly_collection()

        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)

        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'
        fuselage = _generate_fuselage_variant(rng, f"{name}_fuselage", s, mat_base)
        fuselage_length = fuselage.dimensions.y  # actual baked length, matches the GN Length input
        add_optional_modifiers(fuselage, s, rng, 'Y')

        # Wing/sub-wing finishing modifiers (Remesh/Solidify/Bend/Twist/Taper) are applied
        # internally by _generate_wing_pair, before its Mirror modifier -- don't call
        # add_optional_modifiers on them again here.
        wing, attach_y, wing_span = _generate_main_wing(rng, name, s, mat_base, fuselage, fuselage_length)
        created = [fuselage, wing]

        subwing_msg = ""
        if s.assemble_subwing_enable:
            subwing, subwing_attach_y, subwing_span = _generate_sub_wing(rng, name, s, mat_base, fuselage, fuselage_length)
            created.append(subwing)
            subwing_msg = f", sub-wing Y={subwing_attach_y:.2f}"

        aileron_msg = ""
        if s.assemble_aileron_enable:
            aileron = _generate_aileron(rng, name, 'wing_aileron', s, mat_base, fuselage, wing, wing_span)
            created.append(aileron)
            aileron_msg = ", wing aileron"
            if s.assemble_subwing_enable:
                sub_aileron = _generate_aileron(rng, name, 'subwing_aileron', s, mat_base, fuselage, subwing, subwing_span)
                created.append(sub_aileron)
                aileron_msg += "+sub-wing aileron"

        tail_msg = ""
        if s.assemble_tail_enable:
            tail, tail_attach_y = _generate_tail_assembly(rng, name, s, mat_base, fuselage, fuselage_length)
            created.append(tail)
            tail_msg = f", tail Y={tail_attach_y:.2f}"

        canopy_msg = ""
        if s.assemble_canopy_enable:
            canopy, canopy_attach_y = _generate_canopy_assembly(rng, name, s, mat_base, fuselage, fuselage_length)
            created.append(canopy)
            canopy_msg = f", canopy Y={canopy_attach_y:.2f}"

        engine_msg = ""
        if s.assemble_engine_pod_enable:
            mat_glow = make_glow_material('FighterGen_Glow', tuple(s.accent_glow_color))
            span_fracs = _engine_pod_span_fracs(rng, s)
            for i, frac in enumerate(span_fracs):
                pod = _generate_engine_pod(rng, name, f'enginepod{i}', s, mat_base, mat_glow, fuselage, wing, wing_span, frac)
                created.append(pod)
            engine_msg = f", {len(span_fracs)} engine pod(s)/wing"

        weapon_msg = ""
        if s.assemble_wing_weapon_enable:
            mat_glow_wp = make_glow_material('FighterGen_Glow', tuple(s.accent_glow_color))
            wp_span_frac = _rr(rng, s.assemble_wing_weapon_span_frac_min, s.assemble_wing_weapon_span_frac_max)
            wing_weapon = _generate_wing_weapon(rng, name, 'wing_weapon', s, mat_base, mat_glow_wp, fuselage, wing, wing_span, wp_span_frac)
            created.append(wing_weapon)
            weapon_msg = ", wing weapon"

        for obj in created:
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            coll.objects.link(obj)

        bpy.ops.object.select_all(action='DESELECT')
        for obj in created:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = fuselage

        self.report({'INFO'}, f"Assembled full ship (length={fuselage_length:.2f}{subwing_msg}{aileron_msg}{tail_msg}{canopy_msg}{engine_msg}{weapon_msg})")
        return {'FINISHED'}


class FIGHTERGEN_OT_reroll_tail(Operator):
    bl_idname = "fightergen.reroll_tail"
    bl_label = "Reroll Tail Only"
    bl_description = "Keep current assembly and generate a fresh tail pair"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
        fuselage = _find_assembly_fuselage(coll)
        if not fuselage:
            self.report({'ERROR'}, "No assembly fuselage found in FighterGen_Assembly collection")
            return {'CANCELLED'}
        fuselage_length = fuselage.dimensions.y
        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)
        rng = random.Random()
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'

        _remove_assembly_objects_by_suffix(coll, fuselage, '_tail_r')
        tail, attach_y = _generate_tail_assembly(rng, name, s, mat_base, fuselage, fuselage_length)
        for c in list(tail.users_collection):
            c.objects.unlink(tail)
        coll.objects.link(tail)
        self.report({'INFO'}, f"Rerolled tail (attach Y={attach_y:.2f})")
        return {'FINISHED'}


class FIGHTERGEN_OT_reroll_canopy(Operator):
    bl_idname = "fightergen.reroll_canopy"
    bl_label = "Reroll Canopy Only"
    bl_description = "Keep current assembly and generate a fresh canopy"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
        fuselage = _find_assembly_fuselage(coll)
        if not fuselage:
            self.report({'ERROR'}, "No assembly fuselage found in FighterGen_Assembly collection")
            return {'CANCELLED'}
        fuselage_length = fuselage.dimensions.y
        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)
        rng = random.Random()
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'

        _remove_assembly_objects_by_suffix(coll, fuselage, '_canopy')
        canopy, attach_y = _generate_canopy_assembly(rng, name, s, mat_base, fuselage, fuselage_length)
        for c in list(canopy.users_collection):
            c.objects.unlink(canopy)
        coll.objects.link(canopy)
        self.report({'INFO'}, f"Rerolled canopy (attach Y={attach_y:.2f})")
        return {'FINISHED'}


class FIGHTERGEN_OT_reroll_engine_pods(Operator):
    bl_idname = "fightergen.reroll_engine_pods"
    bl_label = "Reroll Engine Pod(s) Only"
    bl_description = "Keep current assembly and generate fresh wing engine pod(s)"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
        fuselage = _find_assembly_fuselage(coll)
        if not fuselage:
            self.report({'ERROR'}, "No assembly fuselage found in FighterGen_Assembly collection")
            return {'CANCELLED'}
        wing = None
        for obj in coll.objects:
            if obj.name.endswith('_wing_r'):
                wing = obj
                break
        if not wing:
            self.report({'ERROR'}, "No main wing found in FighterGen_Assembly collection")
            return {'CANCELLED'}

        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)
        mat_glow = make_glow_material('FighterGen_Glow', tuple(s.accent_glow_color))
        rng = random.Random()
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'

        for obj in [o for o in list(coll.objects) if '_enginepod' in o.name]:
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)

        wing_span = wing.dimensions.x  # full mirrored width; _generate_engine_pod only needs the single-side span for its x_local math
        span_fracs = _engine_pod_span_fracs(rng, s)
        for i, frac in enumerate(span_fracs):
            pod = _generate_engine_pod(rng, name, f'enginepod{i}', s, mat_base, mat_glow, fuselage, wing, wing_span / 2.0, frac)
            for c in list(pod.users_collection):
                c.objects.unlink(pod)
            coll.objects.link(pod)

        self.report({'INFO'}, f"Rerolled {len(span_fracs)} engine pod(s)")
        return {'FINISHED'}


class FIGHTERGEN_OT_reroll_wing_weapon(Operator):
    bl_idname = "fightergen.reroll_wing_weapon"
    bl_label = "Reroll Wing Weapon Only"
    bl_description = "Keep current assembly and generate a fresh wing-mounted weapon"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
        fuselage = _find_assembly_fuselage(coll)
        if not fuselage:
            self.report({'ERROR'}, "No assembly fuselage found in FighterGen_Assembly collection")
            return {'CANCELLED'}
        wing = None
        for obj in coll.objects:
            if obj.name.endswith('_wing_r'):
                wing = obj
                break
        if not wing:
            self.report({'ERROR'}, "No main wing found in FighterGen_Assembly collection")
            return {'CANCELLED'}

        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)
        mat_glow = make_glow_material('FighterGen_Glow', tuple(s.accent_glow_color))
        rng = random.Random()
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'

        _remove_assembly_objects_by_suffix(coll, fuselage, '_wing_weapon_r')

        wing_span = wing.dimensions.x / 2.0  # full mirrored width -> single-side span for x_local math
        wp_span_frac = _rr(rng, s.assemble_wing_weapon_span_frac_min, s.assemble_wing_weapon_span_frac_max)
        weapon = _generate_wing_weapon(rng, name, 'wing_weapon', s, mat_base, mat_glow, fuselage, wing, wing_span, wp_span_frac)
        for c in list(weapon.users_collection):
            c.objects.unlink(weapon)
        coll.objects.link(weapon)

        self.report({'INFO'}, "Rerolled wing weapon")
        return {'FINISHED'}


def _find_assembly_fuselage(coll):
    if coll is None:
        return None
    for obj in coll.objects:
        if obj.name.endswith('_fuselage'):
            return obj
    return None


def _remove_assembly_objects_by_suffix(coll, fuselage, suffix):
    for obj in [o for o in list(coll.objects) if o is not fuselage and o.name.endswith(suffix)]:
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)


class FIGHTERGEN_OT_reroll_wing(Operator):
    bl_idname = "fightergen.reroll_main_wing"
    bl_label = "Reroll Main Wing Only"
    bl_description = ("Keep the current fuselage (and sub-wing, if any) from FighterGen_Assembly "
                       "and generate a fresh main wing -- individual-part re-roll instead of rebuilding the whole ship")
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
        fuselage = _find_assembly_fuselage(coll)
        if fuselage is None:
            self.report({'ERROR'}, "No existing fuselage in FighterGen_Assembly. Run 'Assemble Fighter' first.")
            return {'CANCELLED'}

        rng = random.Random(s.random_seed if s.random_seed != 0 else None)
        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)

        _remove_assembly_objects_by_suffix(coll, fuselage, '_wing_r')
        had_aileron = any(o.name.endswith('_wing_aileron_r') for o in coll.objects)
        _remove_assembly_objects_by_suffix(coll, fuselage, '_wing_aileron_r')

        fuselage_length = fuselage.dimensions.y
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'
        wing, attach_y, wing_span = _generate_main_wing(rng, name, s, mat_base, fuselage, fuselage_length)
        new_objs = [wing]
        if s.assemble_aileron_enable and had_aileron:
            new_objs.append(_generate_aileron(rng, name, 'wing_aileron', s, mat_base, fuselage, wing, wing_span))

        for obj in new_objs:
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            coll.objects.link(obj)

        bpy.ops.object.select_all(action='DESELECT')
        wing.select_set(True)
        bpy.context.view_layer.objects.active = wing

        self.report({'INFO'}, f"Rerolled main wing on existing fuselage (attach Y={attach_y:.2f})")
        return {'FINISHED'}


class FIGHTERGEN_OT_reroll_subwing(Operator):
    bl_idname = "fightergen.reroll_sub_wing"
    bl_label = "Reroll Sub Wing Only"
    bl_description = ("Keep the current fuselage (and main wing, if any) from FighterGen_Assembly "
                       "and generate a fresh sub-wing -- individual-part re-roll instead of rebuilding the whole ship")
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        s = context.scene.fightergen_settings
        coll = bpy.data.collections.get(ASSEMBLY_COLLECTION)
        fuselage = _find_assembly_fuselage(coll)
        if fuselage is None:
            self.report({'ERROR'}, "No existing fuselage in FighterGen_Assembly. Run 'Assemble Fighter' first.")
            return {'CANCELLED'}

        rng = random.Random(s.random_seed if s.random_seed != 0 else None)
        mat_base = make_material('FighterGen_Base', tuple(s.primary_color), s.metallic)

        _remove_assembly_objects_by_suffix(coll, fuselage, '_subwing_r')
        had_aileron = any(o.name.endswith('_subwing_aileron_r') for o in coll.objects)
        _remove_assembly_objects_by_suffix(coll, fuselage, '_subwing_aileron_r')

        fuselage_length = fuselage.dimensions.y
        name = s.name_prefix if s.name_prefix and s.name_prefix != 'part' else 'assembly'
        subwing, attach_y, subwing_span = _generate_sub_wing(rng, name, s, mat_base, fuselage, fuselage_length)
        new_objs = [subwing]
        if s.assemble_aileron_enable and had_aileron:
            new_objs.append(_generate_aileron(rng, name, 'subwing_aileron', s, mat_base, fuselage, subwing, subwing_span))

        for obj in new_objs:
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            coll.objects.link(obj)

        bpy.ops.object.select_all(action='DESELECT')
        subwing.select_set(True)
        bpy.context.view_layer.objects.active = subwing

        self.report({'INFO'}, f"Rerolled sub-wing on existing fuselage (attach Y={attach_y:.2f})")
        return {'FINISHED'}


classes = (
    FighterGenSettings,
    FIGHTERGEN_OT_generate,
    FIGHTERGEN_OT_export_selected,
    FIGHTERGEN_OT_export_assembly_cocos,
    FIGHTERGEN_OT_apply_detail_pass,
    FIGHTERGEN_OT_add_whole_ship_lattice,
    FIGHTERGEN_OT_assemble,
    FIGHTERGEN_OT_reroll_wing,
    FIGHTERGEN_OT_reroll_subwing,
    FIGHTERGEN_OT_reroll_tail,
    FIGHTERGEN_OT_reroll_canopy,
    FIGHTERGEN_OT_reroll_engine_pods,
    FIGHTERGEN_OT_reroll_wing_weapon,
    FIGHTERGEN_PT_panel,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.fightergen_settings = PointerProperty(type=FighterGenSettings)


def unregister():
    del bpy.types.Scene.fightergen_settings
    for c in reversed(classes):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
