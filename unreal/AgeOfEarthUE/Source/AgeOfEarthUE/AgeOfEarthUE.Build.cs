using UnrealBuildTool;

public class AgeOfEarthUE : ModuleRules
{
	public AgeOfEarthUE(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "WebSockets", "Json", "JsonUtilities", "RHI", "RenderCore", "Slate", "SlateCore" });
		if (Target.bBuildEditor)
		{
			// ferramentas de editor (importar o Landscape a partir dos scripts Python)
			PrivateDependencyModuleNames.AddRange(new string[] { "UnrealEd", "Landscape", "ImageWrapper", "AssetRegistry", "MeshDescription", "StaticMeshDescription", "SkeletalMeshDescription", "AnimationCore" });
		}
	}
}
