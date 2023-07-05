import { ICruiseResult } from "dependency-cruiser";
import * as fs from "fs-extra";
import tb from "ts-toolbelt";

export type IConfigJson = {
  OldPatterns: Record<string, Location>;
};

type IMadgeDependencies = Record<string, string[]>;

function isICruiseResult(o: unknown): o is ICruiseResult {
  return typeof o === "object" && o !== null && "modules" in o && "summary" in o;
}

export type ILocation = {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number;
};

class Location implements ILocation {
  Repo: string;
  Package: string;
  Path: string;
  Order?: number | undefined;
  /**
   *
   */
  constructor(source: ILocation) {
    this.Repo = source.Repo ?? "";
    this.Package = source.Package ?? "";
    this.Path = source.Path ?? "";
    this.Order = source.Order ?? 0;
  }

  public toString = () =>
    `${this.Package === this.Repo ? "" : `"${this.Package}"`}${this.Repo}:${this.Path}`;
}

/**
 * IMapResult is an interface that represents a single mapping result. The OldName
 * field is the path that was mapped from. The New field is the Location that
 * was mapped to. If the New field is null or undefined, then the object was
 * not mapped.
 */
export type IMapResult = {
  OldName: string;
  New?: Location;
};

/**
 * MapResult is a class that represents a single mapping result. The OldName
 * field is the path that was mapped from. The New field is the Location that
 * was mapped to. If the New field is null or undefined, then the object was
 * not mapped.
 */
export class MapResult implements IMapResult {
  /** The path that was mapped from. */
  OldName: string;
  /**
   * The Location that was mapped to. If this is null or undefined, then the
   * file was not mapped. The new path can be found in the New.Path field.
   * @see {@link Location}
   */
  New?: Location;

  /**
   * Creates a new MapResult from any object that implements the IMapResult
   * interface. This is useful for converting the results of JSON.parse into
   * MapResult objects.
   *
   * @param source The object to create the MapResult from.
   */
  constructor(source: IMapResult) {
    this.OldName = source.OldName;
    this.New = source.New;
  }

  /** This code checks that the New field is not null or undefined. If it is, the
  function will return false, indicating that the object is not mapped. If
  the New field is not null or undefined, the function will return true,
  indicating that the object is mapped.

  For type guard purposes, also available in a negated form: {@link isUnmapped}
  @returns {boolean} True if the file is mapped, false if the file is unmapped.
  */
  public isMapped: () => this is tb.O.NonNullable<tb.O.Required<IMapResult, "New">, "New"> = () =>
    this.New !== undefined;

  /**
   * This code checks that the New field is null or undefined. If it is, the
   * function will return true, indicating that the object is not mapped. If
   * the New field is not null or undefined, the function will return false,
   * indicating that the object is mapped.
   *
   * For type guard purposes, also available in a negated form: {@link isMapped}
   * @returns {boolean} True if the file is unmapped, false if the file is mapped.
   */
  public isUnmapped: () => this is tb.O.Overwrite<IMapResult, { New: undefined }> = () =>
    this.New === undefined;

  /**
   * Returns the string representation of this entry.
   * @returns The string representation of this entry.
   * @example <caption>Example of a mapped entry</caption>
   * "lib/mapping.ts => src/mapping.ts"
   * @example <caption>Example of an unmapped entry</caption>
   * "lib/mapping.ts (unmapped)"
   */
  public toString = () => `${this.OldName}${this.isUnmapped() ? " (unmapped)" : ` => ${this.New}`}`;
}

export class Config {
  OldPatterns = new Map<string, Location>();
  BranchPrefix = "split/";
}

// TODO: Switch to using this class for mappings
export class Dependency {
  Name: MapResult;
  dependencyMap: MapResult[] = [];
  /**
   *
   */
  constructor({
    Name,
    dependencyMap: dependencies,
  }: {
    Name: MapResult;
    dependencyMap: MapResult[];
  }) {
    this.Name = Name;
    this.dependencyMap = dependencies;
  }

  public toString = (): string =>
    `${this.Name} has ${
      this.dependencyMap.length > 0 ? this.dependencyMap.length : "no "
    }dependencies [${this.dependencyMap.map((d) => d.toString()).join(", ")}]`;
}

export class PackageMapping {
  config = new Config();
  depMap: {
    Name: MapResult;
    dependencyMap: MapResult[];
  }[] = [];

  invdepMap: {
    Name: MapResult;
    dependentMap: MapResult[];
  }[] = [];

  public export() {
    let output = this.depMap.map(($_) => ({
      OldName: $_.Name.OldName,
      NewRepo: $_.Name.New?.Repo,
      NewPackage: $_.Name.New?.Package,
      NewName: $_.Name.New?.Path,
      "Dependency Count": $_.dependencyMap.length,
      "Package Dependencies": $_.dependencyMap
        .map((d) => d.New?.Package ?? "N/A")
        .sort()
        .filter((value, index, self) => self.indexOf(value) === index)
        .filter((value) => value !== $_.Name.New?.Package),
      dependencies: $_.dependencyMap.map((d) =>
        undefined === d.New ? d.OldName : d.New?.Repo + ":" + d.New?.Path
      ),
    }));
    output = output.sort((a, b) =>
      (`${a.NewRepo}${a.NewName}` ?? a.OldName ?? "").localeCompare(
        `${b.NewRepo}${b.NewName}` ?? b.OldName
      )
    );

    return JSON.stringify(output, undefined, 2);
  }

  public exportPackageDependenciesChart(): IMadgeDependencies {
    const output: IMadgeDependencies = {};
    this.depMap.forEach((x) => {
      const packageName =
        (x.Name.New?.Package === "N/A" ? x.Name.New?.Repo : x.Name.New?.Package) ?? "N/A";
      output[packageName] ??= [];
      x.dependencyMap
        .map((d) => (d.New?.Package === "N/A" ? d.New?.Repo : d.New?.Package) ?? "(unmapped)")
        .filter((d) => d !== packageName)
        .filter(
          (value, index, self) =>
            self.indexOf(value) === index &&
            !output[packageName].find((already) => value === already)
        )
        .forEach((d) => output[packageName].push(d));
    });

    return output;
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

  public mapPackage(oldPath: string): Location | undefined {
    for (const oldPattern of this.config.OldPatterns.keys()) {
      let target: ILocation | undefined;
      if (
        new RegExp(oldPattern).test(oldPath) &&
        (target = this.config.OldPatterns.get(oldPattern))
      ) {
        const nw: Location = new Location(target);
        nw.Path = oldPath.replace(oldPattern, nw.Path ?? "");
        return nw;
      }
    }

    return undefined;
  }

  public getPackageMap(
    dependencyJsonPath = "doc/dependency.json",
    configPath = "./PackageMap.json"
  ) {
    const packageMap: IConfigJson = fs.readJsonSync(configPath);

    const dependenciesJson: IMadgeDependencies | ICruiseResult =
      fs.readJsonSync(dependencyJsonPath);

    const dep2: Record<string, string[]> = isICruiseResult(dependenciesJson)
      ? Object.fromEntries(
          dependenciesJson.modules
            .filter(
              (s) =>
                s &&
                !(
                  s.source.startsWith("node_modules") ||
                  s.source.startsWith("@") ||
                  s.source.endsWith(".css")
                )
            )
            .map((m) => [
              m.source,
              m.dependencies
                .map((d) => d.resolved)
                .filter(
                  (s) =>
                    s && !(s.startsWith("node_modules") || s.startsWith("@") || s.endsWith(".css"))
                ) ?? [],
            ])
            .values()
        )
      : dependenciesJson;

    const dependents = this.inverseDependencies(dep2);

    Object.entries(packageMap.OldPatterns)
      .sort((a, b) => (a[1].Order ?? 0) - (b[1].Order ?? 0))
      .forEach((x) => this.config.OldPatterns.set(...x));

    this.depMap = Object.entries(dep2).map((x) => ({
      Name: new MapResult({ OldName: x[0], New: this.mapPackage(x[0]) }),
      dependencyMap: x[1].map((y) => new MapResult({ OldName: y, New: this.mapPackage(y) })),
    }));

    this.invdepMap = Object.entries(dependents).map((x) => ({
      Name: new MapResult({ OldName: x[0], New: this.mapPackage(x[0]) }),
      dependentMap: x[1].map((y) => new MapResult({ OldName: y, New: this.mapPackage(y) })),
    }));

    return this;
  }
}
