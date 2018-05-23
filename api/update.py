import os
import sys
import subprocess

import boto3

REGION = 'eu-west-1'
DIR = os.path.dirname(os.path.abspath(__file__))

session = boto3.Session(profile_name='irdn')
cloudformation = session.client('cloudformation', region_name=REGION)


def update_lambda(lambda_function_name):
    client = session.client('lambda', region_name=REGION)
    with open(os.path.join(DIR, 'skyrsla.zip'), 'rb') as f:
        client.update_function_code(
            FunctionName=lambda_function_name,
            ZipFile=f.read(),
        )
    print('Lambda function %s updated' % (lambda_function_name, ))


def get_stack_name():
    # Meh
    return 'klukka'


def get_outputs(stack_name):
    outputs = cloudformation.describe_stacks(
        StackName=stack_name
    )['Stacks'][0]['Outputs']
    return {
        output['OutputKey']: output['OutputValue']
        for output in outputs
    }


def update_zips():
    p = subprocess.Popen([os.path.join(DIR, 'make-zips.sh')])
    print(p.communicate())
    if p.returncode:
        print('Zip exit with %d' % (p.returncode, ))
        sys.exit(p.returncode)


def write_fn_name(fn_name, cognito_pool_id, cognito_role):
    with open(os.path.join(DIR, '..', 'src', 'lambda.js'), 'w') as f:
        f.write("export default {\n")
        f.write("    skyrslaFunction: '%s',\n" % (fn_name, ))
        f.write("    cognitoPoolId: '%s',\n" % (cognito_pool_id, ))
        f.write("    cognitoRole: '%s',\n" % (cognito_role, ))
        f.write("    region: '%s',\n" % (REGION, ))
        f.write("    accountId: '525422706348',\n")
        f.write("};\n")


def main():
    stack_name = get_stack_name()
    outputs = get_outputs(stack_name)
    fn_name = outputs['SkyrslaFunctionName']
    cognito_pool_id = outputs['CognitoPool']
    cognito_role = outputs['CognitoRole']
    update_zips()
    update_lambda(fn_name)
    write_fn_name(fn_name, cognito_pool_id, cognito_role)


if __name__ == '__main__':
    main()
