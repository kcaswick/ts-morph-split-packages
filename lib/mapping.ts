import * as fs from "fs-extra";

export type IConfigJson = {
  OldPatterns: { [name: string]: ILocation };
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
  }[];
  invdepMap: {
    Name: IMapResult;
    dependentMap: IMapResult[];
  }[];

  public Export() {
    // TODO: Export to JSON
  }

  public InverseDependencies(dependencyList: { [name: string]: string[] }) {
    let dependents = new Map<string, string[]>();
    Object.entries(dependencyList).map((p) => {
      p[1].map((_: string | number) => {
        dependents[_] ??= new Array();
        dependents[_].push(p[0]);
      });
    });
    return dependents;
  }

  public MapPackage(oldPath: string): ILocation {
    for (const oldPattern in this.config.OldPatterns?.keys()) {
      if (new RegExp(oldPattern).test(oldPath)) {
        let nw: ILocation = { ...EmptyLocation, ...this.config.OldPatterns.get(oldPattern) };
        nw.Path = oldPath.replace(oldPattern, nw.Path ?? "");
        return nw ?? EmptyLocation;
      }
    }
    return EmptyLocation;
  }

  public GetPackageMap(
    dependencyJsonPath = "doc/dependency.json",
    configPath = "./PackageMap.json"
  ) {
    let packageMap: IConfigJson = fs.readJsonSync(configPath);
    let dep2: { [name: string]: string[] } = fs.readJsonSync(dependencyJsonPath);

    let dependents = this.InverseDependencies(dep2);

    Object.entries(packageMap.OldPatterns)
      .sort((a, b) => (a[1].Order ?? 0) - (b[1].Order ?? 0))
      .forEach((x) => this.config.OldPatterns.set(...x));

    this.depMap = Object.entries(dep2).map((x) => ({
      Name: { OldName: x[0], New: this.MapPackage(x[0]) },
      dependencyMap: x[1].map((y) => ({ OldName: y, New: this.MapPackage(y) })),
    }));

    this.invdepMap = [...dependents.entries()].map((x) => ({
      Name: { OldName: x[0], New: this.MapPackage(x[0]) },
      dependentMap: x[1].map((y) => ({ OldName: y, New: this.MapPackage(y) })),
    }));
  }
}
