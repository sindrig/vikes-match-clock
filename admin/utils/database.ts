type InputValue = number | string | null | { [key: string]: any };

export const transformPartialUpdates = (
	path: string,
	updates: { [key: string]: InputValue },
): { [key: string]: InputValue } => {
	return Object.entries(updates).reduce((acc, [key, value]) => {
		const toAdd =
			value !== null
				? Object.fromEntries(
						Object.entries(value).map(([subKey, subValue]) => [
							`${path}/${key}/${subKey}`,
							subValue,
						]),
				  )
				: { [`${path}/${key}`]: null };
		return { ...acc, ...toAdd };
	}, {});
};
