# U2: refaz só o /Game/Meshy/M_MeshyObra (obra recortada de baixo para cima, com a tampa de pedra no avesso), sem mexer nos
# outros mestres nem nos MIs. A definição mora em u1_materiais.mestre(obra=True).
# Editor FECHADO: unreal/scripts/ue.sh u2_obra_corte.py /tmp/obra.log
import os
import sys

import unreal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import u1_materiais  # noqa: E402

u1_materiais.mestre("M_MeshyObra", False, obra=True)
unreal.log("AOE_OBRA ok")
