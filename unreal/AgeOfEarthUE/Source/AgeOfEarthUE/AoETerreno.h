#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Dom/JsonObject.h"
#include "AoETerreno.generated.h"

class UProceduralMeshComponent;
class UMaterialInstanceDynamic;
class UTexture2D;

/** U3: terreno montado em tempo de execucao a partir do relevo e das camadas que a ponte manda no hello
 *  (malha em blocos + textura de pesos + mar), no lugar do Landscape pre-construido no editor. */
UCLASS()
class AAoETerreno : public AActor
{
	GENERATED_BODY()
public:
	AAoETerreno();

	/** Monta tudo a partir de map.relevo do hello. TamanhoUu = lado do mapa (tiles * uu por tile). Falso se faltar dado. */
	bool Montar(const TSharedPtr<FJsonObject>& Relevo, float TamanhoUu);

	/** Altura do chao em (X,Y) em uu, interpolada do mapa de alturas (sem traco de raio). */
	float AlturaEm(float X, float Y) const;

	bool Pronto() const { return N > 0; }

private:
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Malha;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> Material;
	UPROPERTY() TObjectPtr<UTexture2D> Pesos;
	UPROPERTY() TObjectPtr<AActor> Mar;

	int32 N = 0;                 // amostras por lado
	float Lado = 0.f;            // tamanho do mapa em uu
	float Passo = 0.f;           // uu entre amostras
	TArray<float> Z;             // altura em uu, N*N, linha j = Y
	void ConstruirMalha();
	void ConstruirPesos(const TArray<uint8>& Grama, const TArray<uint8>& Terra, const TArray<uint8>& Areia, const TArray<uint8>& Rocha);
	void ConstruirMar();
};
