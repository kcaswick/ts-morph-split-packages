import * as fs from "fs-extra";

export type IConfigJson = {
  OldPatterns: Record<string, ILocation>;
};

export type ILocation = {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number;
};

const EmptyLocation: ILocation = { Repo: "", Package: "", Path: "" };

export type IMapResult = {
  OldName: string;
  New: ILocation;
};

export class Config {
  OldPatterns = new Map<string, ILocation>();
}

export class PackageMapping {
  config = new Config();
  depMap: {
    Name: IMapResult;
    dependencyMap: IMapResult[];
  }[] = [];

  invdepMap: {
    Name: IMapResult;
    dependentMap: IMapResult[];
  }[] = [];

  public Export() {
    // TODO: Export to JSON
  }

  public inverseDependencies(dependencyList: Record<string, string[]>) {
    const dependents: Record<string, string[]> = {};
    Object.entries(dependencyList).forEach((p) => {
      p[1].forEach((_: string | number) => {
        dependents[_] ??= [];
        dependents[_].push(p[0]);
      });
    });
    return dependents;
  }

  public mapPackage(oldPath: string): ILocation {
    for (const oldPattern of this.config.OldPatterns.keys()) {
      if (new RegExp(oldPattern).test(oldPath)) {
        const nw: ILocation = { ...EmptyLocation, ...this.config.OldPatterns.get(oldPattern) };
        nw.Path = oldPath.replace(oldPattern, nw.Path ?? "");
        return nw ?? EmptyLocation;
      }
    }

    return EmptyLocation;
  }

  public getPackageMap(
    dependencyJsonPath = "doc/dependency.json",
    configPath = "./PackageMap.json"
  ) {
    const packageMap: IConfigJson = fs.readJsonSync(configPath);
    const dep2: Record<string, string[]> = fs.readJsonSync(dependencyJsonPath);

    const dependents = this.inverseDependencies(dep2);

    Object.entries(packageMap.OldPatterns)
      .sort((a, b) => (a[1].Order ?? 0) - (b[1].Order ?? 0))
      .forEach((x) => this.config.OldPatterns.set(...x));

    this.depMap = Object.entries(dep2).map((x) => ({
      Name: { OldName: x[0], New: this.mapPackage(x[0]) },
      dependencyMap: x[1].map((y) => ({ OldName: y, New: this.mapPackage(y) })),
    }));

    this.invdepMap = Object.entries(dependents).map((x) => ({
      Name: { OldName: x[0], New: this.mapPackage(x[0]) },
      dependentMap: x[1].map((y) => ({ OldName: y, New: this.mapPackage(y) })),
    }));

    return this;
  }
}
